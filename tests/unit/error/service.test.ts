import { describe, expect, it } from 'vitest'
import { toServiceError } from '../../../src/error/service.js'
import { toBase64 } from '../../../src/utils/base64.js'
import { utf8Encode } from '../../../src/utils/bytes.js'
import type { ResponseMessage } from '../../../src/transport/types.js'

function response(statusCode: number, headers: Record<string, string>, body?: string): ResponseMessage {
  const bytes = utf8Encode(body ?? '')
  return {
    status: 'Error',
    statusCode,
    headers,
    body: {
      bytes: () => Promise.resolve(bytes),
      text: () => Promise.resolve(body ?? ''),
      stream: () => ({ read: () => Promise.resolve(null) }),
    },
  }
}

describe('toServiceError', () => {
  it('parses Code, Message, RequestId and EC from an XML body', async () => {
    const e = await toServiceError(
      response(404, { 'x-oss-request-id': 'HEADER-ID' },
        '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code>' +
        '<Message>The specified key does not exist.</Message><RequestId>BODY-ID</RequestId>' +
        '<EC>0026-00000001</EC><HostId>b.oss-cn-hangzhou.aliyuncs.com</HostId></Error>'),
      'GET https://b.oss-cn-hangzhou.aliyuncs.com/k',
    )
    expect(e.statusCode).toBe(404)
    expect(e.code).toBe('NoSuchKey')
    expect(e.requestId).toBe('BODY-ID')
    expect(e.ec).toBe('0026-00000001')
    expect(e.hostId).toBe('b.oss-cn-hangzhou.aliyuncs.com')
    expect(e.errorMessage).toBe('The specified key does not exist.')
    expect(e.requestTarget).toBe('GET https://b.oss-cn-hangzhou.aliyuncs.com/k')
  })

  it('falls back to headers for requestId and ec when the body omits them', async () => {
    const e = await toServiceError(
      response(500, { 'x-oss-request-id': 'HEADER-ID', 'x-oss-ec': '0002-00000902' }, ''),
      'PUT https://b.oss-cn-hangzhou.aliyuncs.com/k',
    )
    expect(e.requestId).toBe('HEADER-ID')
    expect(e.ec).toBe('0002-00000902')
  })

  // The parser accepts any root element, so an HTML error page from a proxy parses cleanly.
  it('uses BadErrorResponse as the code when the body is not parseable', async () => {
    const e = await toServiceError(response(502, {}, '<html>bad gateway</html>'), 'GET /')
    expect(e.code).toBe('BadErrorResponse')
    expect(e.errorMessage).toContain('Failed to parse xml from response body')
    expect(e.errorMessage).toContain('expected element type <Error> but have <html>')
  })

  // The body parsed and carried no Code, so `code` defaults while the server's Message survives.
  it('keeps the server Message when an Error body carries no Code', async () => {
    const e = await toServiceError(response(409, {}, '<Error><Message>only a message</Message></Error>'), 'POST /')
    expect(e.code).toBe('BadErrorResponse')
    expect(e.errorMessage).toBe('only a message')
  })

  it('reads the base64 body out of x-oss-err when the body is empty', async () => {
    const inner = '<Error><Code>AccessDenied</Code><Message>denied</Message><RequestId>R1</RequestId><EC>0003-00000001</EC></Error>'
    const e = await toServiceError(response(403, { 'x-oss-err': toBase64(utf8Encode(inner)) }, ''), 'GET /')
    expect(e.code).toBe('AccessDenied')
    expect(e.requestId).toBe('R1')
  })

  it('matches header names case-insensitively', async () => {
    const e = await toServiceError(response(500, { 'X-Oss-Request-Id': 'MIXED' }, ''), 'GET /')
    expect(e.requestId).toBe('MIXED')
  })

  it('extracts the server timestamp from the Date header for clock-skew correction', async () => {
    const e = await toServiceError(
      response(403, { date: 'Wed, 28 Dec 2022 10:27:41 GMT' },
        '<Error><Code>RequestTimeTooSkewed</Code><Message>skew</Message><RequestId>R</RequestId><EC>E</EC></Error>'),
      'PUT /',
    )
    expect(e.code).toBe('RequestTimeTooSkewed')
    expect(e.timestamp?.toUTCString()).toBe('Wed, 28 Dec 2022 10:27:41 GMT')
  })

  it('survives a response with no body at all', async () => {
    const e = await toServiceError({ status: 'Bad Gateway', statusCode: 502, headers: {} }, 'GET /')
    expect(e.statusCode).toBe(502)
    expect(e.code).toBe('BadErrorResponse')
  })

  it('keeps a truncated snapshot of the body for diagnosis', async () => {
    const e = await toServiceError(response(500, {}, 'x'.repeat(500)), 'GET /')
    expect(e.snapshot?.length).toBe(256)
  })

  // A snapshot cut through a surrogate pair cannot be encoded as UTF-8; an emoji in an object key,
  // echoed into the error body, is all it takes.
  it('truncates the snapshot without splitting a surrogate pair', async () => {
    const body = '<Error>' + 'x'.repeat(248) + '\u{1F600}'.repeat(4) + '</Error>'
    const e = await toServiceError(response(500, {}, body), 'GET /')
    expect(e.snapshot?.length).toBe(255)
    const last = (e.snapshot ?? '').charCodeAt(254)
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false)
  })

  // A platform body reader may reject with a non-Error; losing the never-throws contract here
  // would lose the requestId with it.
  it('survives a body reader that rejects with a non-Error', async () => {
    const e = await toServiceError(
      {
        status: 'Error',
        statusCode: 500,
        headers: { 'x-oss-request-id': 'STILL-HERE' },
        body: {
          bytes: () => Promise.resolve(new Uint8Array()),
          // Rejecting with a non-Error is the condition under test; a platform reader is not bound
          // by the lint rule our own code is.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          text: () => Promise.reject(Object.create(null)),
          stream: () => ({ read: () => Promise.resolve(null) }),
        },
      },
      'GET /',
    )
    expect(e.code).toBe('BadErrorResponse')
    expect(e.requestId).toBe('STILL-HERE')
    expect(e.errorMessage).toContain('was not an Error')
  })

  it('survives an Error whose message throws when read', async () => {
    const hostile = new Error('unused')
    Object.defineProperty(hostile, 'message', {
      get: () => {
        throw new Error('message getter')
      },
    })
    const e = await toServiceError(
      {
        status: 'Error',
        statusCode: 500,
        headers: { 'x-oss-request-id': 'STILL-HERE' },
        body: {
          bytes: () => Promise.resolve(new Uint8Array()),
          text: () => Promise.reject(hostile),
          stream: () => ({ read: () => Promise.resolve(null) }),
        },
      },
      'GET /',
    )
    expect(e.code).toBe('BadErrorResponse')
    expect(e.requestId).toBe('STILL-HERE')
    expect(e.errorMessage).toContain('could not be converted to a string')
  })
})
