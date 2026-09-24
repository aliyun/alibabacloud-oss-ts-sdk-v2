import { describe, expect, it } from 'vitest'
import { CanceledError, CredentialsError, OssError, RequestError, ServiceError } from '../../../src/error/types.js'
import {
  ClientErrorRetryable,
  DEFAULT_ERROR_RETRYABLES,
  HttpStatusCodeRetryable,
  ServiceErrorCodeRetryable,
} from '../../../src/retry/retryable.js'

function serviceError(statusCode: number, code: string): ServiceError {
  return new ServiceError({ statusCode, code, message: 'm', requestId: 'R', ec: '', headers: {} })
}

describe('HttpStatusCodeRetryable', () => {
  const r = new HttpStatusCodeRetryable()

  it('retries every 5xx', () => {
    expect(r.isErrorRetryable(serviceError(500, 'InternalError'))).toBe(true)
    expect(r.isErrorRetryable(serviceError(503, 'ServiceUnavailable'))).toBe(true)
    expect(r.isErrorRetryable(serviceError(599, 'Whatever'))).toBe(true)
  })

  it('retries exactly 401, 408 and 429 below 500', () => {
    expect(r.isErrorRetryable(serviceError(401, 'InvalidAccessKeyId'))).toBe(true)
    expect(r.isErrorRetryable(serviceError(408, 'RequestTimeout'))).toBe(true)
    expect(r.isErrorRetryable(serviceError(429, 'TooManyRequests'))).toBe(true)
    expect(r.isErrorRetryable(serviceError(403, 'AccessDenied'))).toBe(false)
    expect(r.isErrorRetryable(serviceError(404, 'NoSuchKey'))).toBe(false)
    expect(r.isErrorRetryable(serviceError(400, 'InvalidArgument'))).toBe(false)
  })

  it('ignores errors that are not ServiceError', () => {
    expect(r.isErrorRetryable(new Error('read ECONNRESET'))).toBe(false)
  })
})

describe('ServiceErrorCodeRetryable', () => {
  const r = new ServiceErrorCodeRetryable()

  it('retries RequestTimeTooSkewed and BadRequest whatever the status', () => {
    expect(r.isErrorRetryable(serviceError(403, 'RequestTimeTooSkewed'))).toBe(true)
    expect(r.isErrorRetryable(serviceError(400, 'BadRequest'))).toBe(true)
  })

  it('does not retry other service codes', () => {
    expect(r.isErrorRetryable(serviceError(404, 'NoSuchKey'))).toBe(false)
    expect(r.isErrorRetryable(new Error('BadRequest'))).toBe(false)
  })
})

describe('ClientErrorRetryable', () => {
  const r = new ClientErrorRetryable()

  it('retries a RequestError whatever it says', () => {
    expect(r.isErrorRetryable(new RequestError('read ECONNRESET'))).toBe(true)
    expect(r.isErrorRetryable(new RequestError('anything at all'))).toBe(true)
  })

  it('retries a RequestError nested one link down', () => {
    expect(r.isErrorRetryable(new OssError('outer', new RequestError('inner')))).toBe(true)
  })

  // Fetching credentials is itself a network call whose commonest failure another attempt survives.
  it('retries a CredentialsError', () => {
    expect(r.isErrorRetryable(new CredentialsError('the provider failed'))).toBe(true)
  })

  it('does not retry an error no transport claimed', () => {
    expect(r.isErrorRetryable(new Error('read: connection reset by peer'))).toBe(false)
    expect(r.isErrorRetryable(new TypeError('Failed to fetch'))).toBe(false)
    expect(r.isErrorRetryable(new OssError('fetch failed: getaddrinfo ENOTFOUND oss.example'))).toBe(false)
  })

  it('never retries a cancellation, even nested under a RequestError', () => {
    expect(r.isErrorRetryable(new CanceledError())).toBe(false)
    expect(r.isErrorRetryable(new RequestError('connection reset', new CanceledError()))).toBe(false)
  })

  // A foreign error's `cause` is not a field the portable tree may read (ArkTS 10605029), so
  // wrapping is the transport's job.
  it('does not look inside a foreign error, leaving that to the transport', () => {
    const outer = new TypeError('fetch failed') as TypeError & { cause?: unknown }
    outer.cause = new RequestError('read ECONNRESET')
    expect(r.isErrorRetryable(outer)).toBe(false)
  })

  it('terminates on a self-referential cause chain', () => {
    const a = new OssError('nope')
    Object.assign(a, { cause: a })
    expect(r.isErrorRetryable(a)).toBe(false)
  })

  it('does not read a ServiceError message as connection evidence', () => {
    const poisoned = new ServiceError({
      statusCode: 404,
      code: 'NoSuchKey',
      message: 'The specified key does not exist. connection reset',
      requestId: 'R',
      ec: '',
      headers: {},
    })
    expect(r.isErrorRetryable(poisoned)).toBe(false)
    expect(DEFAULT_ERROR_RETRYABLES.some((each) => each.isErrorRetryable(poisoned))).toBe(false)
  })
})

describe('DEFAULT_ERROR_RETRYABLES', () => {
  it('composes the three predicates', () => {
    const retryable = (error: Error): boolean => DEFAULT_ERROR_RETRYABLES.some((r) => r.isErrorRetryable(error))
    expect(retryable(serviceError(500, 'InternalError'))).toBe(true)
    expect(retryable(serviceError(403, 'RequestTimeTooSkewed'))).toBe(true)
    expect(retryable(new RequestError('connection refused'))).toBe(true)
    expect(retryable(serviceError(404, 'NoSuchKey'))).toBe(false)
    expect(retryable(new CanceledError())).toBe(false)
  })
})
