import { describe, expect, it } from 'vitest'
import type { ExecuteContext } from '../../../src/internal/execute-context.js'
import { ServiceError } from '../../../src/error/types.js'
import type { Logger } from '../../../src/log/logger.js'
import { ResponseCheckerMiddleware } from '../../../src/internal/checker-middleware.js'
import type { ExecuteMiddleware } from '../../../src/internal/execute-middleware.js'
import type { RequestMessage, ResponseMessage, ResponseBody } from '../../../src/transport/types.js'
import type { ResponseHandler } from '../../../src/types.js'
import { executeContext } from '../../fixtures/execute-context.js'
import { textBody } from '../../fixtures/mock-transport.js'
import { createHeaderFields } from '../../../src/utils/header-fields.js'

const request: RequestMessage = { method: 'GET', url: 'https://b.example.com/k?versionId=v1', headers: createHeaderFields() }

interface Seen {
  request: RequestMessage
  context: ExecuteContext
}

function stubNext(response: ResponseMessage, seen?: Seen[]): ExecuteMiddleware {
  return {
    execute: (req, ctx) => {
      seen?.push({ request: req, context: ctx })
      return Promise.resolve(response)
    },
  }
}

// A body readable once, like a fetch response body.
function oneShotBody(text: string): ResponseBody {
  let read = false
  return {
    text: () => {
      if (read) return Promise.reject(new Error('body already consumed'))
      read = true
      return Promise.resolve(text)
    },
    bytes: () => Promise.reject(new Error('not used by this test')),
    stream: () => {
      throw new Error('not used by this test')
    },
  }
}

function contextWithHandlers(...handlers: ResponseHandler[]): ExecuteContext {
  const context = executeContext()
  context.responseHandlers = handlers
  return context
}

function recordingLogger(lines: string[]): Logger {
  return {
    debug: (message) => lines.push('debug ' + message),
    info: (message) => lines.push('info ' + message),
    warn: (message) => lines.push('warn ' + message),
    error: (message) => lines.push('error ' + message),
  }
}

describe('ResponseCheckerMiddleware', () => {
  it('returns the inner response object itself on a 2xx, with the body unread', async () => {
    const inner: ResponseMessage = { statusCode: 200, status: 'OK', headers: { etag: '"A"' }, body: oneShotBody('payload') }
    const response = await new ResponseCheckerMiddleware(stubNext(inner)).execute(request, executeContext())
    expect(response).toBe(inner)
    expect(await response.body?.text()).toBe('payload')
  })

  it('passes 204 and 206 through', async () => {
    for (const statusCode of [204, 206]) {
      const inner: ResponseMessage = { statusCode, status: '', headers: {} }
      expect(await new ResponseCheckerMiddleware(stubNext(inner)).execute(request, executeContext())).toBe(inner)
    }
  })

  it("hands the inner middleware the caller's own request and context", async () => {
    const seen: Seen[] = []
    const inner: ResponseMessage = { statusCode: 200, status: 'OK', headers: {} }
    const context = executeContext()
    await new ResponseCheckerMiddleware(stubNext(inner, seen)).execute(request, context)
    expect(seen.length).toBe(1)
    expect(seen[0].request).toBe(request)
    expect(seen[0].context).toBe(context)
  })

  it('lets a transport rejection through untouched, without running the handlers', async () => {
    const failure = new Error('socket hang up')
    const seen: number[] = []
    const rejecting: ExecuteMiddleware = { execute: () => Promise.reject(failure) }
    const context = contextWithHandlers((statusCode) => seen.push(statusCode))
    await expect(new ResponseCheckerMiddleware(rejecting).execute(request, context)).rejects.toBe(failure)
    expect(seen).toEqual([])
  })

  it('treats a 1xx as a failure, not a success', async () => {
    const inner: ResponseMessage = { statusCode: 100, status: 'Continue', headers: {} }
    const error: unknown = await new ResponseCheckerMiddleware(stubNext(inner))
      .execute(request, executeContext())
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ServiceError)
    expect((error as ServiceError).statusCode).toBe(100)
  })

  it('treats a 3xx as a failure, not a success', async () => {
    const inner: ResponseMessage = { statusCode: 302, status: 'Found', headers: {} }
    const error: unknown = await new ResponseCheckerMiddleware(stubNext(inner))
      .execute(request, executeContext())
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ServiceError)
    expect((error as ServiceError).statusCode).toBe(302)
  })

  it('converts a 4xx into a ServiceError carrying the parsed code and the request target', async () => {
    const inner: ResponseMessage = {
      statusCode: 404,
      status: 'Not Found',
      headers: { 'x-oss-request-id': 'REQ-1' },
      body: textBody(
        '<?xml version="1.0"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message><RequestId>REQ-1</RequestId><EC>0026-00000001</EC></Error>',
      ),
    }
    const error: unknown = await new ResponseCheckerMiddleware(stubNext(inner))
      .execute(request, executeContext())
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ServiceError)
    const serviceError = error as ServiceError
    expect(serviceError.statusCode).toBe(404)
    expect(serviceError.code).toBe('NoSuchKey')
    expect(serviceError.requestTarget).toBe('GET https://b.example.com/k?versionId=v1')
  })

  it('converts a 5xx with no body into a ServiceError', async () => {
    const inner: ResponseMessage = { statusCode: 503, status: 'Service Unavailable', headers: {} }
    const error = (await new ResponseCheckerMiddleware(stubNext(inner))
      .execute(request, executeContext())
      .catch((e: unknown) => e)) as ServiceError
    expect(error).toBeInstanceOf(ServiceError)
    expect(error.statusCode).toBe(503)
    expect(error.code).toBe('BadErrorResponse')
  })

  it('notifies every response handler on success, in order', async () => {
    const seen: string[] = []
    const context = contextWithHandlers(
      (statusCode, headers) => seen.push('first ' + String(statusCode) + ' ' + (headers['etag'] ?? '')),
      (statusCode) => seen.push('second ' + String(statusCode)),
    )
    const inner: ResponseMessage = { statusCode: 200, status: 'OK', headers: { etag: '"A"' } }
    await new ResponseCheckerMiddleware(stubNext(inner)).execute(request, context)
    expect(seen).toEqual(['first 200 "A"', 'second 200'])
  })

  it('lets an exception from a response handler fail a successful request', async () => {
    const boom = new Error('handler exploded')
    const inner: ResponseMessage = { statusCode: 200, status: 'OK', headers: {} }
    const context = contextWithHandlers(() => {
      throw boom
    })
    await expect(new ResponseCheckerMiddleware(stubNext(inner)).execute(request, context)).rejects.toBe(boom)
  })

  it('never runs a handler on a non-2xx, so no handler can displace the ServiceError', async () => {
    const seen: number[] = []
    const inner: ResponseMessage = { statusCode: 500, status: 'Internal Server Error', headers: {} }
    const context = contextWithHandlers((statusCode) => {
      seen.push(statusCode)
      throw new Error('handler exploded')
    })
    const error: unknown = await new ResponseCheckerMiddleware(stubNext(inner))
      .execute(request, context)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ServiceError)
    expect((error as ServiceError).statusCode).toBe(500)
    expect(seen).toEqual([])
  })

  it('logs the failing target and status when a logger is configured', async () => {
    const lines: string[] = []
    const inner: ResponseMessage = { statusCode: 404, status: 'Not Found', headers: {} }
    await new ResponseCheckerMiddleware(stubNext(inner), recordingLogger(lines))
      .execute(request, executeContext())
      .catch(() => undefined)
    expect(lines).toEqual(['debug Non-2xx response for GET https://b.example.com/k?versionId=v1: 404'])
  })

  it('logs nothing on a 2xx', async () => {
    const lines: string[] = []
    const inner: ResponseMessage = { statusCode: 200, status: 'OK', headers: {} }
    await new ResponseCheckerMiddleware(stubNext(inner), recordingLogger(lines)).execute(request, executeContext())
    expect(lines).toEqual([])
  })
})
