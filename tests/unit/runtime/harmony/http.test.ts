import { describe, expect, it } from 'vitest'
import {
  createHarmonyTransport,
  type DataSendProgressInfo,
  type HarmonyHttpModule,
  type HttpResponse,
  type HarmonyRequestOptions,
} from '../../../../src/runtime/harmony/http.js'
import type { AbortSignalLike } from '../../../../src/utils/abort.js'
import type { ByteContent, RequestMessage, StreamLike } from '../../../../src/transport/types.js'
import { bytesBody, stringBody, streamBody } from '../../../../src/transport/content.js'
import { CanceledError, DeserializationError, RequestError, SerializationError } from '../../../../src/error/types.js'
import { ClientErrorRetryable } from '../../../../src/retry/retryable.js'
import { createHeaderFields } from '../../../../src/utils/header-fields.js'
import { utf8Decode, utf8Encode } from '../../../../src/utils/bytes.js'

interface Call {
  url: string
  options: HarmonyRequestOptions
  /** Drives netstack's `dataSendProgress` at whatever cumulative `sendSize`/`totalSize` a reply wants. */
  emitSend: (sendSize: number, totalSize: number) => void
}

interface Fake extends HarmonyHttpModule {
  calls: Call[]
  created: number
  destroyed: number
}

/** Stands in for `@ohos.net.http`; `destroy()` rejects any in-flight request, as the device module does. */
function fakeModule(reply: (call: Call) => Promise<HttpResponse>): Fake {
  const fake: Fake = {
    calls: [],
    created: 0,
    destroyed: 0,
    HttpDataType: { ARRAY_BUFFER: 2 },
    createHttp() {
      fake.created += 1
      let onDestroy: (() => void) | undefined
      let sendListener: ((info: DataSendProgressInfo) => void) | undefined
      return {
        request(url: string, options: HarmonyRequestOptions): Promise<HttpResponse> {
          const call: Call = {
            url,
            options,
            emitSend: (sendSize, totalSize) => sendListener?.({ sendSize, totalSize }),
          }
          fake.calls.push(call)
          return new Promise<HttpResponse>((resolve, reject) => {
            onDestroy = (): void => {
              reject(new Error('request destroyed'))
            }
            void reply(call).then(resolve, reject)
          })
        },
        on(_type: 'dataSendProgress', callback: (info: DataSendProgressInfo) => void): void {
          sendListener = callback
        },
        off(_type: 'dataSendProgress'): void {
          sendListener = undefined
        },
        destroy(): void {
          fake.destroyed += 1
          if (onDestroy !== undefined) onDestroy()
        },
      }
    },
  }
  return fake
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function replyWith(
  body: string,
  header: Record<string, string | string[]> = {},
): (call: Call) => Promise<HttpResponse> {
  return () => Promise.resolve({ responseCode: 200, header, result: toArrayBuffer(utf8Encode(body)) })
}

/** A netstack `BusinessError`: an ordinary `Error` carrying a numeric `code`. */
function nativeError(code: number, message: string): Error {
  const error: Error & { code?: number } = new Error(message)
  error.code = code
  return error
}

function failWith(error: Error): () => Promise<HttpResponse> {
  return () => Promise.reject(error)
}

const stalled = (): Promise<HttpResponse> => new Promise<HttpResponse>(() => undefined)

function request(overrides: Partial<RequestMessage> = {}): RequestMessage {
  return {
    method: 'GET',
    url: 'https://bucket.oss-cn-hangzhou.aliyuncs.com/key',
    headers: createHeaderFields({ 'x-oss-meta-a': '1' }),
    ...overrides,
  }
}

function sendFailure(fake: Fake, req: RequestMessage = request()): Promise<Error | undefined> {
  return createHarmonyTransport({ http: fake })
    .send(req, {})
    .then(() => undefined)
    .catch((err: unknown) => err as Error)
}

function controllable(): { signal: AbortSignalLike; abort: () => void; listeners: () => number } {
  const listeners = new Set<() => void>()
  let aborted = false
  return {
    signal: {
      get aborted(): boolean {
        return aborted
      },
      addEventListener(_type: 'abort', listener: () => void): void {
        listeners.add(listener)
      },
      removeEventListener(_type: 'abort', listener: () => void): void {
        listeners.delete(listener)
      },
    },
    abort(): void {
      aborted = true
      for (const listener of listeners) listener()
    },
    listeners: (): number => listeners.size,
  }
}

describe('createHarmonyTransport', () => {
  it('passes the method, url and the caller headers to netstack', async () => {
    const fake = fakeModule(replyWith(''))
    await createHarmonyTransport({ http: fake }).send(request({ method: 'PUT' }), {})

    expect(fake.calls.length).toBe(1)
    expect(fake.calls[0].url).toBe('https://bucket.oss-cn-hangzhou.aliyuncs.com/key')
    expect(fake.calls[0].options.method).toBe('PUT')
    expect(fake.calls[0].options.header['x-oss-meta-a']).toBe('1')
  })

  it('asks for an ArrayBuffer and maps responseCode onto statusCode', async () => {
    const fake = fakeModule(() =>
      Promise.resolve({ responseCode: 404, header: {}, result: toArrayBuffer(utf8Encode('')) }),
    )
    const response = await createHarmonyTransport({ http: fake }).send(request(), {})

    expect(fake.calls[0].options.expectDataType).toBe(fake.HttpDataType.ARRAY_BUFFER)
    expect(response.statusCode).toBe(404)
    // No reason phrase is available from @ohos.net.http.
    expect(response.status).toBe('')
  })

  it('lowercases response header names and joins repeated values', async () => {
    const fake = fakeModule(replyWith('', { 'X-OSS-Request-Id': 'abc', 'Set-Cookie': ['a=1', 'b=2'] }))
    const response = await createHarmonyTransport({ http: fake }).send(request(), {})

    expect(response.headers['x-oss-request-id']).toBe('abc')
    expect(response.headers['set-cookie']).toBe('a=1, b=2')
  })

  it('exposes the body as bytes, text and a single-chunk stream', async () => {
    const fake = fakeModule(replyWith('<Error><Code>NoSuchKey</Code></Error>'))
    const response = await createHarmonyTransport({ http: fake }).send(request(), {})
    const body = response.body

    expect(body).toBeDefined()
    if (body === undefined) return
    expect(await body.text()).toContain('NoSuchKey')
    expect((await body.bytes()).byteLength).toBe(37)
    const stream: StreamLike = body.stream()
    expect((await stream.read())?.byteLength).toBe(37)
    expect(await stream.read()).toBeNull()
  })

  it('accepts a string result as well as an ArrayBuffer', async () => {
    const fake = fakeModule(() => Promise.resolve({ responseCode: 200, header: {}, result: 'plain text' }))
    const response = await createHarmonyTransport({ http: fake }).send(request(), {})

    expect(await response.body?.text()).toBe('plain text')
  })

  it('rejects an unexpected result shape with DeserializationError', async () => {
    const fake = fakeModule(() => Promise.resolve({ responseCode: 200, header: {}, result: { parsed: true } }))

    await expect(createHarmonyTransport({ http: fake }).send(request(), {})).rejects.toBeInstanceOf(DeserializationError)
  })

  it('sends a string body, drained into its own ArrayBuffer', async () => {
    const fake = fakeModule(replyWith(''))
    await createHarmonyTransport({ http: fake }).send(request({ method: 'POST', body: stringBody('<Delete/>') }), {})

    // netstack buffers every body.
    const sent = fake.calls[0].options.extraData
    expect(sent instanceof ArrayBuffer).toBe(true)
    if (!(sent instanceof ArrayBuffer)) return
    expect(utf8Decode(new Uint8Array(sent))).toBe('<Delete/>')
  })

  it('copies a Uint8Array body into its own ArrayBuffer, honouring byteOffset', async () => {
    const pool = new Uint8Array([9, 9, 1, 2, 3, 9])
    const fake = fakeModule(replyWith(''))
    await createHarmonyTransport({ http: fake }).send(request({ method: 'PUT', body: bytesBody(pool.subarray(2, 5)) }), {})

    const sent = fake.calls[0].options.extraData
    expect(sent instanceof ArrayBuffer).toBe(true)
    if (!(sent instanceof ArrayBuffer)) return
    expect(Array.from(new Uint8Array(sent))).toEqual([1, 2, 3])
  })

  it('rejects a one-shot streaming body with SerializationError without opening a request', async () => {
    const fake = fakeModule(replyWith(''))
    const body: StreamLike = { read: () => Promise.resolve(null) }

    await expect(
      createHarmonyTransport({ http: fake }).send(request({ method: 'PUT', body: streamBody(body) }), {}),
    ).rejects.toBeInstanceOf(SerializationError)
    expect(fake.created).toBe(0)
  })

  it('cancels a cursor-only body once it has been drained', async () => {
    const fake = fakeModule(replyWith(''))
    let canceled = 0
    const body: ByteContent = {
      length: 2,
      oneShot: false,
      source: () => {
        let sent = false
        return {
          read: () => {
            if (sent) return Promise.resolve(null)
            sent = true
            return Promise.resolve(utf8Encode('hi'))
          },
          cancel: () => {
            canceled++
            return Promise.resolve()
          },
        }
      },
    }

    await createHarmonyTransport({ http: fake }).send(request({ method: 'PUT', body }), {})
    const sent = fake.calls[0].options.extraData
    expect(sent instanceof ArrayBuffer).toBe(true)
    if (sent instanceof ArrayBuffer) expect(utf8Decode(new Uint8Array(sent))).toBe('hi')
    expect(canceled).toBe(1)
  })

  it('cancels a cursor-only body whose read fails mid-drain, then rejects before opening a request', async () => {
    const fake = fakeModule(replyWith(''))
    let canceled = 0
    const boom = new Error('the file vanished')
    const body: ByteContent = {
      length: 4,
      oneShot: false,
      source: () => ({
        read: () => Promise.reject(boom),
        cancel: () => {
          canceled++
          return Promise.resolve()
        },
      }),
    }

    await expect(createHarmonyTransport({ http: fake }).send(request({ method: 'PUT', body }), {})).rejects.toBe(boom)
    expect(canceled).toBe(1)
    expect(fake.created).toBe(0)
  })

  // On these five methods netstack appends a string body to the URL as query parameters, after the URL was signed without them.
  it('refuses a body on the methods netstack would append to the URL', async () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT']) {
      const fake = fakeModule(replyWith(''))
      const error = await createHarmonyTransport({ http: fake })
        .send(request({ method, body: stringBody('a=1') }), {})
        .then(() => undefined)
        .catch((err: unknown) => err as Error)

      expect(error).toBeInstanceOf(SerializationError)
      expect(error?.message).toContain(method)
      expect(fake.created).toBe(0)
    }
  })

  // netstack's `connectTimeout` caps only the handshake; an unset value is omitted.
  it('takes connectTimeout from the transport options, leaving it absent when unset', async () => {
    const withConnect = fakeModule(replyWith(''))
    await createHarmonyTransport({ http: withConnect, connectTimeoutMs: 3000 }).send(request(), {})
    expect(withConnect.calls[0].options.connectTimeout).toBe(3000)

    const withoutConnect = fakeModule(replyWith(''))
    await createHarmonyTransport({ http: withoutConnect }).send(request(), {})
    expect(Object.keys(withoutConnect.calls[0].options)).not.toContain('connectTimeout')
  })

  // netstack's `readTimeout` is a whole-transfer deadline, not an idle one; it remains 0.
  it('never arms readTimeout, whatever the send options', async () => {
    for (const options of [{}, { readWriteTimeoutMs: 3000 }]) {
      const fake = fakeModule(replyWith(''))
      await createHarmonyTransport({ http: fake }).send(request(), options)

      expect(fake.calls[0].options.readTimeout).toBe(0)
    }
  })

  // netstack's default response limit is 5 MiB.
  it('asks for the largest response body @ohos.net.http accepts', async () => {
    const fake = fakeModule(replyWith(''))
    await createHarmonyTransport({ http: fake }).send(request(), {})

    expect(fake.calls[0].options.maxLimit).toBe(100 * 1024 * 1024)
  })

  // netstack defaults content-type to application/json on these three methods, which is not what was signed.
  it('sends an empty content-type on PUT, POST and DELETE that carry none', async () => {
    for (const method of ['PUT', 'POST', 'DELETE']) {
      const fake = fakeModule(replyWith(''))
      await createHarmonyTransport({ http: fake }).send(request({ method }), {})

      expect(fake.calls[0].options.header['content-type']).toBe('')
    }
  })

  // The caller's content type wins case-insensitively.
  it('leaves an explicit content-type alone, whatever its casing', async () => {
    for (const name of ['Content-Type', 'CONTENT-TYPE']) {
      const fake = fakeModule(replyWith(''))
      await createHarmonyTransport({ http: fake }).send(request({ method: 'PUT', headers: createHeaderFields({ [name]: 'text/plain' }) }), {})

      expect(fake.calls[0].options.header).toEqual({ [name]: 'text/plain' })
    }
  })

  it('sends no content-type on a GET, which netstack does not default', async () => {
    const fake = fakeModule(replyWith(''))
    await createHarmonyTransport({ http: fake }).send(request(), {})

    expect(fake.calls[0].options.header).toEqual({ 'x-oss-meta-a': '1' })
  })

  it('does not mutate the request headers', async () => {
    const fake = fakeModule(replyWith(''))
    const req = request({ method: 'PUT' })
    await createHarmonyTransport({ http: fake }).send(req, {})

    expect(req.headers.toRecord()).toEqual({ 'x-oss-meta-a': '1' })
  })

  it('rejects a pre-aborted signal with CanceledError without opening a request', async () => {
    const fake = fakeModule(replyWith(''))
    const controller = controllable()
    controller.abort()

    await expect(createHarmonyTransport({ http: fake }).send(request(), { signal: controller.signal })).rejects.toBeInstanceOf(
      CanceledError,
    )
    expect(fake.created).toBe(0)
  })

  it('destroys the request and reports CanceledError when the signal fires mid-flight', async () => {
    const fake = fakeModule(stalled)
    const controller = controllable()
    const promise = createHarmonyTransport({ http: fake }).send(request(), { signal: controller.signal })
    controller.abort()

    await expect(promise).rejects.toBeInstanceOf(CanceledError)
    expect(fake.destroyed).toBe(1)
    expect(controller.listeners()).toBe(0)
  })

  it('lets a reply that takes real time finish', async () => {
    const fake = fakeModule(
      () =>
        new Promise<HttpResponse>((resolve) => {
          setTimeout(() => resolve({ responseCode: 200, header: {}, result: 'late' }), 20)
        }),
    )

    expect((await createHarmonyTransport({ http: fake }).send(request(), {})).statusCode).toBe(200)
  })

  it('destroys the request exactly once on success', async () => {
    const fake = fakeModule(replyWith('ok'))
    await createHarmonyTransport({ http: fake }).send(request(), {})

    expect(fake.destroyed).toBe(1)
  })

  it('removes its abort listener when the request succeeds', async () => {
    const fake = fakeModule(replyWith('ok'))
    const controller = controllable()
    await createHarmonyTransport({ http: fake }).send(request(), { signal: controller.signal })

    expect(controller.listeners()).toBe(0)
  })

  it('translates transient netstack codes into failures the retryer accepts', async () => {
    const retryable = new ClientErrorRetryable()
    for (const code of [
      2300005, 2300006, 2300007, 2300016, 2300018, 2300028, 2300035, 2300052, 2300055, 2300056, 2300080, 2300092,
    ]) {
      const native = nativeError(code, 'Failed something')
      const error = await sendFailure(fakeModule(failWith(native)))

      expect(error).toBeInstanceOf(RequestError)
      expect(retryable.isErrorRetryable(error!)).toBe(true)
      expect(error?.message).toContain(String(code))
      expect(error?.message).toContain('Failed something')
      expect((error as Error & { cause?: Error }).cause).toBe(native)
    }
  })

  it('leaves the codes outside the table untranslated and non-retryable', async () => {
    for (const code of [2300053, 2300058, 2300059, 2300060, 2300077, 2300999]) {
      const native = nativeError(code, 'the device declined')
      const error = await sendFailure(fakeModule(failWith(native)))

      expect(error).toBe(native)
      expect(new ClientErrorRetryable().isErrorRetryable(error!)).toBe(false)
    }
  })

  it('explains a 2300023 as the response size limit, and does not retry it', async () => {
    const native = nativeError(2300023, 'Failed to write the received data')
    const error = await sendFailure(fakeModule(failWith(native)))

    expect(error?.message).toContain('104857600')
    expect(error?.message).toContain('ranged request')
    expect(new ClientErrorRetryable().isErrorRetryable(error!)).toBe(false)
  })

  it('passes a failure with no netstack code through untouched', async () => {
    const plain = new Error('something else went wrong')
    expect(await sendFailure(fakeModule(failWith(plain)))).toBe(plain)

    const lettered: Error & { code?: string } = new Error('not a BusinessError')
    lettered.code = 'ENOTASHAPEWEKNOW'
    expect(await sendFailure(fakeModule(failWith(lettered)))).toBe(lettered)
  })

  it('passes a rejection that is not an Error through untouched', async () => {
    const notAnError = { code: 2300007, message: 'shaped like a BusinessError, but not one' }

    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    expect(await sendFailure(fakeModule(() => Promise.reject(notAnError)))).toBe(notAnError)
  })
})

describe('createHarmonyTransport progress', () => {
  // netstack's `sendSize` is cumulative.
  it('differences a cumulative sendSize into raw increments', async () => {
    const increments: number[] = []
    const fake = fakeModule((call) => {
      call.emitSend(3, 6)
      call.emitSend(6, 6)
      return replyWith('')(call)
    })
    await createHarmonyTransport({ http: fake }).send(request({ method: 'PUT', body: bytesBody(utf8Encode('abcdef')) }), {
      progressReporter: (increment) => increments.push(increment),
    })

    expect(increments).toEqual([3, 3])
  })

  it('reports nothing for a repeat that does not advance sendSize', async () => {
    const increments: number[] = []
    const fake = fakeModule((call) => {
      call.emitSend(6, 6)
      call.emitSend(6, 6)
      return replyWith('')(call)
    })
    await createHarmonyTransport({ http: fake }).send(request({ method: 'PUT', body: bytesBody(utf8Encode('abcdef')) }), {
      progressReporter: (increment) => increments.push(increment),
    })

    expect(increments).toEqual([6])
  })
})

describe('createHarmonyTransport proxy', () => {
  it('passes a host and port to netstack as usingProxy', async () => {
    const fake = fakeModule(replyWith(''))
    await createHarmonyTransport({ http: fake, proxyHost: 'http://10.0.0.1:3128' }).send(request(), {})

    expect(fake.calls[0].options.usingProxy).toEqual({ host: '10.0.0.1', port: 3128, exclusionList: [] })
  })

  // netstack's `HttpProxy` contains only a host and port.
  it('strips the scheme and credentials netstack cannot carry', async () => {
    const fake = fakeModule(replyWith(''))
    await createHarmonyTransport({ http: fake, proxyHost: 'https://user:p%40ss@proxy.example:8080/path' }).send(request(), {})

    expect(fake.calls[0].options.usingProxy).toEqual({ host: 'proxy.example', port: 8080, exclusionList: [] })
  })

  // A missing proxy port defaults to 80.
  it('defaults a portless proxy to 80', async () => {
    const fake = fakeModule(replyWith(''))
    await createHarmonyTransport({ http: fake, proxyHost: 'proxy.example' }).send(request(), {})

    expect(fake.calls[0].options.usingProxy).toEqual({ host: 'proxy.example', port: 80, exclusionList: [] })
  })

  it('sends no usingProxy when no proxy is configured', async () => {
    const fake = fakeModule(replyWith(''))
    await createHarmonyTransport({ http: fake }).send(request(), {})

    expect(Object.keys(fake.calls[0].options)).not.toContain('usingProxy')
  })

  // An unparseable proxy leaves the field off rather than passing netstack a broken host or a NaN port.
  it('omits usingProxy when the proxy has no usable host or port', async () => {
    for (const proxyHost of ['', '   ', 'http://', 'http://:3128', 'http://host:notaport']) {
      const fake = fakeModule(replyWith(''))
      await createHarmonyTransport({ http: fake, proxyHost }).send(request(), {})

      expect(Object.keys(fake.calls[0].options)).not.toContain('usingProxy')
    }
  })
})

describe('createHarmonyTransport ignored network options', () => {
  // netstack always verifies certificates and follows redirects; both flags are ignored.
  it('accepts insecureSkipVerify and enabledRedirect, passing neither to netstack', async () => {
    const fake = fakeModule(replyWith('served'))
    const response = await createHarmonyTransport({ http: fake, insecureSkipVerify: true, enabledRedirect: true }).send(
      request(),
      {},
    )

    expect(response.statusCode).toBe(200)
    const keys = Object.keys(fake.calls[0].options)
    expect(keys).not.toContain('insecureSkipVerify')
    expect(keys).not.toContain('enabledRedirect')
  })
})

describe('createHarmonyTransport responseStream', () => {
  // netstack hands back whole bodies as ArrayBuffers; the option changes nothing here.
  it('accepts responseStream either way, always serving the whole body', async () => {
    for (const responseStream of [true, false]) {
      const fake = fakeModule(replyWith('served'))
      const response = await createHarmonyTransport({ http: fake }).send(request(), { responseStream })

      expect(response.statusCode).toBe(200)
      expect(await response.body?.text()).toBe('served')
      expect(Object.keys(fake.calls[0].options)).not.toContain('responseStream')
    }
  })
})

describe('createHarmonyTransport platform', () => {
  it('omits it, since naming the device needs a second @ohos. module', () => {
    expect(createHarmonyTransport({ http: fakeModule(replyWith('')) }).platform).toBeUndefined()
  })

  it('cannot stream the request body: netstack takes it whole', () => {
    expect(createHarmonyTransport({ http: fakeModule(replyWith('')) }).canStreamUpload).toBe(false)
  })
})
