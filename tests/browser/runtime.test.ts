import { describe, expect, it } from 'vitest'
import * as sdk from '../../src/index.js'
import { createBrowserTransport } from '../../src/runtime/browser/http.js'
import type { AbortSignalLike } from '../../src/utils/abort.js'
import { CanceledError, RequestError } from '../../src/error/types.js'
import { ClientErrorRetryable } from '../../src/retry/retryable.js'
import { utf8Encode } from '../../src/utils/bytes.js'
import { toHex } from '../../src/utils/hex.js'
import { createHeaderFields } from '../../src/utils/header-fields.js'
import { md5 } from '../../src/utils/md5.js'
import { hmacSha1 } from '../../src/utils/sha1.js'
import { hmacSha256, sha256 } from '../../src/utils/sha256.js'

const MARKER = 'browser-transport-marker'

function signalOf(controller: AbortController): AbortSignalLike {
  return controller.signal
}

describe('the public surface in a browser', () => {
  it('imports with no node: resolution and exposes the Client', () => {
    expect(typeof sdk.Client).toBe('function')
    expect(typeof sdk.PutObject).toBe('function')
  })
})

describe('the headers a browser refuses to send', () => {
  it('drops Date, which V1 signs, and User-Agent, which Config.userAgent sets', () => {
    const request = new Request(import.meta.url, {
      headers: { Date: 'Tue, 01 Jan 2030 00:00:00 GMT', 'User-Agent': 'oss-sdk/0.1' },
    })

    expect(request.headers.get('date')).toBeNull()
    expect(request.headers.get('user-agent')).toBeNull()
    // Control: the guard drops the forbidden names, not every name.
    expect(new Request(import.meta.url, { headers: { 'x-oss-meta-k': 'v' } }).headers.get('x-oss-meta-k')).toBe('v')
  })
})

describe('pure-TypeScript hashing in a browser engine', () => {
  it('produces the FIPS 180-4 SHA-256 vector', () => {
    expect(toHex(sha256(utf8Encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('produces the RFC 4231 HMAC-SHA256 vector', () => {
    const key = new Uint8Array(20).fill(0x0b)
    expect(toHex(hmacSha256(key, utf8Encode('Hi There')))).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    )
  })

  it('produces the RFC 2202 HMAC-SHA1 vector', () => {
    const key = new Uint8Array(20).fill(0x0b)
    expect(toHex(hmacSha1(key, utf8Encode('Hi There')))).toBe('b617318655057264e28bc0b6fb378c8ef146be00')
  })

  it('produces the MD5 vector', () => {
    expect(toHex(md5(utf8Encode('hello')))).toBe('5d41402abc4b2a76b9719d911017c592')
  })
})

describe('browser transport against the dev server', () => {
  const transport = createBrowserTransport()

  it('fetches a same-origin URL and reads headers and body', async () => {
    const response = await transport.send({ method: 'GET', url: import.meta.url, headers: createHeaderFields() }, {})

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('javascript')
    expect(await response.body?.text()).toContain(MARKER)
  })

  it('sends a Uint8Array body', async () => {
    const response = await transport.send(
      { method: 'POST', url: import.meta.url, headers: createHeaderFields(), body: sdk.bytesBody(utf8Encode('payload')) },
      {},
    )

    expect(typeof response.statusCode).toBe('number')
  })

  it('reports a mid-flight abort as CanceledError, not a network failure', async () => {
    const controller = new AbortController()
    const promise = transport.send(
      { method: 'GET', url: import.meta.url, headers: createHeaderFields() },
      { signal: signalOf(controller) },
    )
    controller.abort()

    await expect(promise).rejects.toBeInstanceOf(CanceledError)
  })

  it('reports an opaque fetch failure as a retryable RequestError', async () => {
    const error = await transport
      .send({ method: 'GET', url: 'https://oss.invalid/key', headers: createHeaderFields() }, {})
      .then(() => undefined)
      .catch((err: unknown) => err as Error)

    expect(error).not.toBeInstanceOf(CanceledError)
    expect(error).toBeInstanceOf(RequestError)
    expect(new ClientErrorRetryable().isErrorRetryable(error!)).toBe(true)
  })
})
