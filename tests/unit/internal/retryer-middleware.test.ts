import { describe, expect, it, vi } from 'vitest'
import { CanceledError, RequestError, ServiceError } from '../../../src/error/types.js'
import type { Logger } from '../../../src/log/logger.js'
import { ResponseCheckerMiddleware } from '../../../src/internal/checker-middleware.js'
import { RetryerMiddleware } from '../../../src/internal/retryer-middleware.js'
import { TransportMiddleware } from '../../../src/internal/transport-middleware.js'
import type { ExecuteMiddleware } from '../../../src/internal/execute-middleware.js'
import { FixedDelayBackoff } from '../../../src/retry/backoff.js'
import { NopRetryer, StandardRetryer } from '../../../src/retry/standard.js'
import type { BackoffDelayer } from '../../../src/retry/types.js'
import type { RequestMessage, ResponseMessage } from '../../../src/transport/types.js'
import { bytesBody, streamBody } from '../../../src/transport/content.js'
import { controllableSignal } from '../../fixtures/abort-signal.js'
import { executeContext } from '../../fixtures/execute-context.js'
import type { MockResponse, MockTransport } from '../../fixtures/mock-transport.js'
import { createMockTransport } from '../../fixtures/mock-transport.js'
import { createHeaderFields } from '../../../src/utils/header-fields.js'

function request(body?: RequestMessage['body']): RequestMessage {
  return { method: 'PUT', url: 'https://b.example.com/k', headers: createHeaderFields(), body }
}

const ok: MockResponse = { statusCode: 200, status: 'OK', headers: {} }

const serverError: MockResponse = {
  statusCode: 500,
  status: 'Internal Server Error',
  headers: { 'x-oss-request-id': 'REQ' },
  body: '<Error><Code>InternalError</Code><Message>boom</Message><RequestId>REQ</RequestId></Error>',
}

function recordingBackoff(fixedDelayMs: number): BackoffDelayer & { waits: number[] } {
  const backoff = new FixedDelayBackoff(fixedDelayMs)
  const waits: number[] = []
  return {
    waits,
    backoffDelay: (attempt, error) => {
      const delayMs = backoff.backoffDelay(attempt, error)
      waits.push(delayMs)
      return delayMs
    },
  }
}

// The default chain without the signer.
function chain(
  responses: MockResponse[],
  backoffMs = 11,
): { transport: MockTransport; head: RetryerMiddleware; waits: number[] } {
  const transport = createMockTransport({ responses })
  const inner = new ResponseCheckerMiddleware(new TransportMiddleware(transport))
  const backoff = recordingBackoff(backoffMs)
  return { transport, head: new RetryerMiddleware(inner, new StandardRetryer({ backoff })), waits: backoff.waits }
}

describe('RetryerMiddleware', () => {
  it('returns the first successful response without sleeping', async () => {
    const { transport, head, waits } = chain([ok])
    const response = await head.execute(request(), executeContext())
    expect(response.statusCode).toBe(200)
    expect(transport.requests.length).toBe(1)
    expect(waits).toEqual([])
  })

  it('retries a 500 up to three attempts and then throws the last error', async () => {
    const { transport, head, waits } = chain([serverError])
    const error: unknown = await head.execute(request(), executeContext()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ServiceError)
    expect((error as ServiceError).statusCode).toBe(500)
    expect(transport.requests.length).toBe(3)
    expect(waits).toEqual([11, 11])
  })

  it('stops as soon as an attempt succeeds', async () => {
    const { transport, head, waits } = chain([serverError, ok])
    expect((await head.execute(request(), executeContext())).statusCode).toBe(200)
    expect(transport.requests.length).toBe(2)
    expect(waits).toEqual([11])
  })

  // The first retry uses attempt number 2.
  it('asks the backoff for the upcoming attempt number, starting at 2', async () => {
    const transport = createMockTransport({ responses: [serverError] })
    const seen: number[] = []
    const head = new RetryerMiddleware(
      new ResponseCheckerMiddleware(new TransportMiddleware(transport)),
      new StandardRetryer({
        backoff: {
          backoffDelay: (attempt) => {
            seen.push(attempt)
            return 0
          },
        },
      }),
    )
    await head.execute(request(), executeContext()).catch(() => undefined)
    expect(seen).toEqual([2, 3])
  })

  it('does not retry a non-retryable status', async () => {
    const { transport, head } = chain([
      { statusCode: 404, status: 'Not Found', headers: {}, body: '<Error><Code>NoSuchKey</Code></Error>' },
    ])
    await expect(head.execute(request(), executeContext())).rejects.toBeInstanceOf(ServiceError)
    expect(transport.requests.length).toBe(1)
  })

  it('honours a per-request retryMaxAttempts override', async () => {
    const { transport, head, waits } = chain([serverError])
    const context = executeContext()
    context.retryMaxAttempts = 2
    await head.execute(request(), context).catch(() => undefined)
    expect(transport.requests.length).toBe(2)
    expect(waits).toEqual([11])
  })

  // Clamped: a 0 would make `tries <= maxAttempts` false on the first pass, sending no request.
  it('treats a retryMaxAttempts below one as one attempt', async () => {
    const { transport, head } = chain([serverError])
    const context = executeContext()
    context.retryMaxAttempts = 0
    await head.execute(request(), context).catch(() => undefined)
    expect(transport.requests.length).toBe(1)
  })

  it('treats a NaN retryMaxAttempts as one attempt, not as none', async () => {
    const { transport, head } = chain([serverError])
    const context = executeContext()
    context.retryMaxAttempts = Number.NaN
    const error: unknown = await head.execute(request(), context).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ServiceError)
    expect(transport.requests.length).toBe(1)
  })

  it('makes exactly one attempt with NopRetryer', async () => {
    const transport = createMockTransport({ responses: [serverError] })
    const retryer = new NopRetryer()
    const retryDelay = vi.spyOn(retryer, 'retryDelay')
    const head = new RetryerMiddleware(new ResponseCheckerMiddleware(new TransportMiddleware(transport)), retryer)
    await head.execute(request(), executeContext()).catch(() => undefined)
    expect(transport.requests.length).toBe(1)
    expect(retryDelay).not.toHaveBeenCalled()
  })

  // One-shot request bodies are not retried.
  it('does not retry a one-shot stream body', async () => {
    const { transport, head } = chain([serverError])
    await head.execute(request(streamBody({ read: () => Promise.resolve(null) })), executeContext()).catch(() => undefined)
    expect(transport.requests.length).toBe(1)
  })

  it('retries a Uint8Array body, which is replayable', async () => {
    const { transport, head } = chain([serverError])
    await head.execute(request(bytesBody(new Uint8Array([1, 2, 3]))), executeContext()).catch(() => undefined)
    expect(transport.requests.length).toBe(3)
  })

  it('retries a transport-level connection error', async () => {
    const { transport, head } = chain([{ error: new RequestError('read: connection reset by peer') }])
    await head.execute(request(), executeContext()).catch(() => undefined)
    expect(transport.requests.length).toBe(3)
  })

  it('corrects the clock and clears signTime after RequestTimeTooSkewed', async () => {
    const skew: MockResponse = {
      statusCode: 403,
      status: 'Forbidden',
      headers: { date: 'Wed, 28 Dec 2022 11:27:41 GMT', 'x-oss-request-id': 'REQ' },
      body: '<Error><Code>RequestTimeTooSkewed</Code><Message>skew</Message><RequestId>REQ</RequestId></Error>',
    }
    const transport = createMockTransport({ responses: [skew, ok] })
    const context = executeContext()
    const signAt = new Date(Date.UTC(2022, 11, 28, 10, 27, 41))
    const inner = new ResponseCheckerMiddleware(new TransportMiddleware(transport))
    // Stands in for the signer: fills `signTime` when unset, adding the recorded offset.
    const stamping: ExecuteMiddleware = {
      execute: (req, ctx) => {
        if (ctx.signingContext.signTime === undefined) {
          ctx.signingContext.signTime = new Date(signAt.getTime() + (ctx.signingContext.clockOffset ?? 0))
        }
        return inner.execute(req, ctx)
      },
    }
    const warnings: string[] = []
    const logger: Logger = {
      debug: () => undefined,
      info: () => undefined,
      warn: (message) => warnings.push(message),
      error: () => undefined,
    }
    const head = new RetryerMiddleware(stamping, new StandardRetryer({ backoff: new FixedDelayBackoff(0) }), logger)

    await head.execute(request(), context).catch(() => undefined)
    expect(transport.requests.length).toBe(2)
    // The server's clock is one hour ahead of the time we signed with.
    expect(context.signingContext.clockOffset).toBe(3_600_000)
    expect(context.signingContext.signTime?.toUTCString()).toBe('Wed, 28 Dec 2022 11:27:41 GMT')
    expect(warnings.length).toBe(1)
    expect(warnings[0]).toContain('3600000ms')
  })

  // No clock correction is applied without a parseable `Date` header.
  it('leaves the clock uncorrected when a skew response has no usable Date header', async () => {
    const skewNoDate: MockResponse = {
      statusCode: 403,
      status: 'Forbidden',
      headers: { 'x-oss-request-id': 'REQ' },
      body: '<Error><Code>RequestTimeTooSkewed</Code><Message>skew</Message><RequestId>REQ</RequestId></Error>',
    }
    const signAt = new Date(Date.UTC(2022, 11, 28, 9, 27, 41))
    const transport = createMockTransport({ responses: [skewNoDate] })
    const context = executeContext()
    const inner = new ResponseCheckerMiddleware(new TransportMiddleware(transport))
    const stamping: ExecuteMiddleware = {
      execute: (req, ctx) => {
        if (ctx.signingContext.signTime === undefined) ctx.signingContext.signTime = signAt
        return inner.execute(req, ctx)
      },
    }
    const head = new RetryerMiddleware(stamping, new StandardRetryer({ backoff: new FixedDelayBackoff(0) }))
    await head.execute(request(), context).catch(() => undefined)
    expect(transport.requests.length).toBe(3)
    expect(context.signingContext.clockOffset).toBeUndefined()
  })

  it('leaves a caller-pinned signTime alone across retries', async () => {
    const pinned = new Date(Date.UTC(2020, 0, 1, 0, 0, 0))
    const context = executeContext()
    context.signingContext.signTime = pinned
    const { transport, head } = chain([serverError])
    await head.execute(request(), context).catch(() => undefined)
    expect(transport.requests.length).toBe(3)
    expect(context.signingContext.signTime).toBe(pinned)
  })

  it('never retries a cancellation, even when the retryer would retry anything', async () => {
    const transport = createMockTransport({ responses: [{ error: new CanceledError() }] })
    const backoff = recordingBackoff(11)
    const head = new RetryerMiddleware(
      new ResponseCheckerMiddleware(new TransportMiddleware(transport)),
      new StandardRetryer({ backoff, errorRetryables: [{ isErrorRetryable: () => true }] }),
    )
    await expect(head.execute(request(), executeContext())).rejects.toBeInstanceOf(CanceledError)
    expect(transport.requests.length).toBe(1)
    expect(backoff.waits).toEqual([])
  })

  it('does not call the next middleware when the signal is already aborted', async () => {
    const seen: RequestMessage[] = []
    const next: ExecuteMiddleware = {
      execute: (req) => {
        seen.push(req)
        const response: ResponseMessage = { statusCode: 200, status: 'OK', headers: {} }
        return Promise.resolve(response)
      },
    }
    const c = controllableSignal()
    c.abort()
    const context = executeContext()
    context.signal = c.signal
    const head = new RetryerMiddleware(next, new StandardRetryer({ backoff: new FixedDelayBackoff(11) }))
    await expect(head.execute(request(), context)).rejects.toBeInstanceOf(CanceledError)
    expect(seen).toEqual([])
  })

  it('rejects the backoff wait as soon as the signal fires, without finishing it', async () => {
    const c = controllableSignal()
    const transport = createMockTransport({ responses: [serverError] })
    vi.useFakeTimers()
    try {
      const head = new RetryerMiddleware(
        new ResponseCheckerMiddleware(new TransportMiddleware(transport)),
        new StandardRetryer({
          backoff: {
            backoffDelay: () => {
              void Promise.resolve().then(() => {
                c.abort()
              })
              return 60_000
            },
          },
        }),
      )
      const context = executeContext()
      context.signal = c.signal
      await expect(head.execute(request(), context)).rejects.toBeInstanceOf(CanceledError)
      expect(transport.requests.length).toBe(1)
      expect(c.attachCount).toBe(1)
      expect(c.listenerCount).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('logs the upcoming retry, with its delay and its cause, before waiting', async () => {
    const messages: string[] = []
    const logger: Logger = {
      debug: () => undefined,
      info: (message) => messages.push(message),
      warn: () => undefined,
      error: () => undefined,
    }
    const transport = createMockTransport({ responses: [serverError, ok] })
    vi.useFakeTimers()
    try {
      const head = new RetryerMiddleware(
        new ResponseCheckerMiddleware(new TransportMiddleware(transport)),
        new StandardRetryer({ backoff: new FixedDelayBackoff(11) }),
        logger,
      )
      const pending = head.execute(request(), executeContext())

      await vi.advanceTimersByTimeAsync(10)
      expect(messages.length).toBe(1)
      expect(messages[0]).toContain('tries: 2')
      expect(messages[0]).toContain('11ms')
      expect(messages[0]).toContain('InternalError')
      expect(transport.requests.length).toBe(1)

      await vi.advanceTimersByTimeAsync(1)
      expect((await pending).statusCode).toBe(200)
      expect(transport.requests.length).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
