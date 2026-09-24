import { describe, expect, it } from 'vitest'
import type { AbortSignalLike } from '../../../src/utils/abort.js'
import { CanceledError, RequestError } from '../../../src/error/types.js'
import { missingTransport, TransportMiddleware } from '../../../src/internal/transport-middleware.js'
import type { RequestMessage } from '../../../src/transport/types.js'
import { executeContext } from '../../fixtures/execute-context.js'
import { createMockTransport } from '../../fixtures/mock-transport.js'
import { createHeaderFields } from '../../../src/utils/header-fields.js'

const request: RequestMessage = { method: 'GET', url: 'https://b.example.com/k', headers: createHeaderFields({ 'x-a': '1' }) }

function abortSignal(aborted: boolean): AbortSignalLike {
  return { aborted, addEventListener: () => {}, removeEventListener: () => {} }
}

describe('TransportMiddleware', () => {
  it('hands the request to the transport unchanged and returns its response', async () => {
    const transport = createMockTransport({
      responses: [{ statusCode: 206, status: 'Partial Content', headers: { etag: '"A"' }, body: 'chunk' }],
    })
    const response = await new TransportMiddleware(transport).execute(request, executeContext())
    expect(response.statusCode).toBe(206)
    expect(response.status).toBe('Partial Content')
    expect(response.headers.etag).toBe('"A"')
    // A response rebuilt from scalar fields loses `body` silently, surfacing only mid-download.
    expect(await response.body?.text()).toBe('chunk')
    expect(transport.requests.length).toBe(1)
    // Identity: a rebuilt request drops a forgotten field and reaches the caller as SignatureDoesNotMatch.
    expect(transport.requests[0]).toBe(request)
  })

  // Identity rules out a wrapper: the transport's `RequestError` is what the retryer judges by, so
  // replacing it would make every connection reset look permanent.
  it('lets a transport failure through untouched', async () => {
    const failure = new RequestError('socket hang up')
    const transport = createMockTransport({ responses: [{ error: failure }] })
    await expect(new TransportMiddleware(transport).execute(request, executeContext())).rejects.toBe(failure)
  })

  it('passes the per-request read/write timeout', async () => {
    const transport = createMockTransport()
    const context = executeContext()
    context.readWriteTimeoutMs = 5_000
    await new TransportMiddleware(transport).execute(request, context)
    expect(transport.sendOptions[0].readWriteTimeoutMs).toBe(5_000)
  })

  // Absent, not filled from the client: the configured idle deadline already lives in the transport.
  it('sends no read/write timeout when the request overrides none', async () => {
    const transport = createMockTransport()
    await new TransportMiddleware(transport).execute(request, executeContext())
    expect(transport.sendOptions[0].readWriteTimeoutMs).toBeUndefined()
  })

  // A truthiness guard would drop the 0 and leave the transport's own deadline in force.
  it('treats an explicit zero in the context as an override, not as absent', async () => {
    const transport = createMockTransport()
    const context = executeContext()
    context.readWriteTimeoutMs = 0
    await new TransportMiddleware(transport).execute(request, context)
    expect(transport.sendOptions[0].readWriteTimeoutMs).toBe(0)
  })

  it('sends no read/write timeout when the client supplied none', async () => {
    const transport = createMockTransport()
    await new TransportMiddleware(transport).execute(request, executeContext())
    expect(transport.sendOptions[0].readWriteTimeoutMs).toBeUndefined()
  })

  it('forwards the abort signal', async () => {
    const transport = createMockTransport()
    const signal = abortSignal(false)
    const context = executeContext()
    context.signal = signal
    await new TransportMiddleware(transport).execute(request, context)
    expect(transport.sendOptions[0].signal).toBe(signal)
  })

  it('forwards the responseStream flag either way', async () => {
    const streaming = createMockTransport()
    const streamingContext = executeContext()
    streamingContext.responseStream = true
    await new TransportMiddleware(streaming).execute(request, streamingContext)
    expect(streaming.sendOptions[0].responseStream).toBe(true)

    const buffered = createMockTransport()
    const bufferedContext = executeContext()
    bufferedContext.responseStream = false
    await new TransportMiddleware(buffered).execute(request, bufferedContext)
    expect(buffered.sendOptions[0].responseStream).toBe(false)
  })

  // Rejects rather than throwing synchronously: `execute` returns a Promise an outer middleware may `.catch`.
  it('rejects with CanceledError without touching the transport when already aborted', async () => {
    const transport = createMockTransport()
    const context = executeContext()
    context.signal = abortSignal(true)
    const middleware = new TransportMiddleware(transport)
    await expect(middleware.execute(request, context)).rejects.toBeInstanceOf(CanceledError)
    expect(transport.requests.length).toBe(0)
  })

  // `missingTransport` is the sentinel the client inserts when `Config.transport` is absent.
  it('reports a missing transport', async () => {
    await expect(new TransportMiddleware(missingTransport).execute(request, executeContext())).rejects.toThrow(
      'missing required field, Config.transport',
    )
  })
})
