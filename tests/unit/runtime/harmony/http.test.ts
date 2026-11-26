import { describe, expect, it } from 'vitest'
import {
  createHarmonyTransport,
  type DataSendProgressInfo,
  type HarmonyHttpModule,
  type HttpResponse,
  type HarmonyRequestOptions,
} from '../../../../src/runtime/harmony/http.js'
import type { RawHeaders } from '../../../../src/runtime/harmony/headers.js'
import type { AbortSignalLike } from '../../../../src/utils/abort.js'
import type { ByteContent, ByteSink, ByteSinkFactory, RequestMessage, StreamLike } from '../../../../src/transport/types.js'
import { toOneShotSinkFactory, TransportCapabilityType } from '../../../../src/transport/types.js'
import { bytesBody, stringBody, streamBody } from '../../../../src/transport/content.js'
import {
  CanceledError,
  DeserializationError,
  OssError,
  RequestError,
  SerializationError,
} from '../../../../src/error/types.js'
import { ClientErrorRetryable } from '../../../../src/retry/retryable.js'
import { createHeaderFields } from '../../../../src/utils/header-fields.js'
import { concatBytes, utf8Decode, utf8Encode } from '../../../../src/utils/bytes.js'

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
        requestInStream(): Promise<number> {
          return Promise.reject(new Error('the buffered path never streams'))
        },
        // One handle carries all three events; the buffered path arms only the send progress.
        on(type: string, callback: (arg: never) => void): void {
          if (type === 'dataSendProgress') sendListener = callback as (info: DataSendProgressInfo) => void
        },
        off(type: string): void {
          if (type === 'dataSendProgress') sendListener = undefined
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

/** One streamed call: the test pushes the platform events through `emit*`, then settles the status. */
interface StreamCall {
  url: string
  options: HarmonyRequestOptions
  emitHeaders(header: RawHeaders): void
  emitData(chunk: Uint8Array): void
}

interface StreamFake extends HarmonyHttpModule {
  calls: StreamCall[]
  created: number
  destroyed: number
}

/**
 * Stands in for netstack's streaming half. `requestInStream` settles only after the whole body has been
 * pushed, and `headersReceive` carries no status, which is exactly what the sink path works around.
 * `destroy()` ends the transfer, as on the device.
 */
function fakeStreamModule(reply: (call: StreamCall) => Promise<number>): StreamFake {
  const fake: StreamFake = {
    calls: [],
    created: 0,
    destroyed: 0,
    HttpDataType: { ARRAY_BUFFER: 2 },
    createHttp() {
      fake.created += 1
      let onDestroy: (() => void) | undefined
      let headers: ((header: RawHeaders) => void) | undefined
      let data: ((chunk: ArrayBuffer) => void) | undefined
      return {
        request(): Promise<HttpResponse> {
          return Promise.reject(new Error('a sink is never served by the buffered path'))
        },
        requestInStream(url: string, options: HarmonyRequestOptions): Promise<number> {
          const call: StreamCall = {
            url,
            options,
            emitHeaders: (header) => headers?.(header),
            emitData: (chunk) => data?.(toArrayBuffer(chunk)),
          }
          fake.calls.push(call)
          return new Promise<number>((resolve, reject) => {
            onDestroy = (): void => reject(new Error('request destroyed'))
            reply(call).then(resolve, reject)
          })
        },
        on(type: string, callback: (arg: never) => void): void {
          if (type === 'headersReceive') headers = callback as (header: RawHeaders) => void
          if (type === 'dataReceive') data = callback as (chunk: ArrayBuffer) => void
        },
        off(type: string): void {
          if (type === 'headersReceive') headers = undefined
          if (type === 'dataReceive') data = undefined
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

interface Collected {
  sink: ByteSink
  /** The factory form of the same thing, which is what a transport is handed. */
  factory: ByteSinkFactory
  /** One entry per `write`, so a case can see how the body was split. */
  writes: Uint8Array[]
  text(): string
}

/** A `ByteSink` that keeps what it was given; refuses every write once `rejectAfterBytes` have landed. */
function collectingSink(rejectAfterBytes?: number): Collected {
  const writes: Uint8Array[] = []
  let delivered = 0
  const sink: ByteSink = {
    write(chunk: Uint8Array): Promise<void> {
      if (rejectAfterBytes !== undefined && delivered >= rejectAfterBytes) {
        return Promise.reject(new Error('the disk is full'))
      }
      delivered += chunk.byteLength
      writes.push(chunk)
      return Promise.resolve()
    },
  }
  return {
    sink,
    factory: toOneShotSinkFactory(sink),
    writes,
    text: () => utf8Decode(concatBytes(writes)),
  }
}

/** Splits a body the way netstack hands one over. */
function parts(body: string, each: number): string[] {
  const out: string[] = []
  for (let at = 0; at < body.length; at += each) out.push(body.slice(at, at + each))
  return out
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

  it('treats a missing response body as empty bytes', async () => {
    for (const result of [null, undefined]) {
      const fake = fakeModule(() => Promise.resolve({ responseCode: 200, header: {}, result }))
      const response = await createHarmonyTransport({ http: fake }).send(request({ method: 'PUT' }), {})
      expect((await response.body?.bytes())?.byteLength).toBe(0)
    }
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

  // netstack defaults content-type to application/json, so the client settles it before signing; the transport forwards it.
  it('hands netstack the content-type the client signed, in the casing it was given', async () => {
    for (const name of ['Content-Type', 'content-type']) {
      const fake = fakeModule(replyWith(''))
      const req = request({ method: 'PUT', headers: createHeaderFields({ [name]: 'text/plain', 'x-oss-meta-a': '1' }) })
      await createHarmonyTransport({ http: fake }).send(req, {})

      expect(fake.calls[0].options.header).toEqual({ [name]: 'text/plain', 'x-oss-meta-a': '1' })
    }
  })

  it('adds no content-type of its own to a request that carries none', async () => {
    for (const method of ['PUT', 'POST', 'DELETE', 'GET']) {
      const fake = fakeModule(replyWith(''))
      await createHarmonyTransport({ http: fake }).send(request({ method }), {})

      expect(Object.keys(fake.calls[0].options.header).map((name) => name.toLowerCase())).not.toContain('content-type')
    }
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

describe('createHarmonyTransport sinkFactory', () => {
  it('takes the body through the sink and hands back none', async () => {
    const body = 'a'.repeat(64 * 1024) + 'tail'
    const fake = fakeStreamModule((call) => {
      call.emitHeaders({ 'x-oss-request-id': 'abc' })
      for (const part of parts(body, 4096)) call.emitData(utf8Encode(part))
      return Promise.resolve(200)
    })
    const taken = collectingSink()

    const response = await createHarmonyTransport({ http: fake }).send(request(), {
      sinkFactory: taken.factory,
    })

    expect(fake.calls.length).toBe(1)
    expect(fake.calls[0].options.method).toBe('GET')
    expect(fake.calls[0].options.header['x-oss-meta-a']).toBe('1')
    expect(response.statusCode).toBe(200)
    // `headersReceive` is the only header source in stream mode, and it arrives without a status.
    expect(response.headers['x-oss-request-id']).toBe('abc')
    expect(taken.text()).toBe(body)
    // Those bytes are the caller's file now, not a body.
    expect(await response.body?.bytes()).toEqual(new Uint8Array(0))
    expect(fake.destroyed).toBe(1)
  })

  // A push reaches the sink as the bytes it arrived in: the transport keeps no buffer of its own, so the
  // body is not copied on the way to a sink that copies for the platform's sake anyway.
  it('writes each push as it arrives', async () => {
    const body = 'b'.repeat(20 * 1024)
    const fake = fakeStreamModule((call) => {
      for (const part of parts(body, 1024)) call.emitData(utf8Encode(part))
      return Promise.resolve(200)
    })
    const taken = collectingSink()

    await createHarmonyTransport({ http: fake }).send(request(), { sinkFactory: taken.factory })

    expect(taken.writes.length).toBe(20)
    expect(taken.writes.every((write: Uint8Array): boolean => write.byteLength === 1024)).toBe(true)
    expect(taken.text()).toBe(body)
  })

  // The mark is looked for after normalization, whatever case the platform's own map carried.
  it('routes on a mark of any case', async () => {
    const document = '<Error><Code>NoSuchKey</Code></Error>'
    const fake = fakeStreamModule((call) => {
      call.emitHeaders({ 'X-OSS-EC': '0003-00000101' })
      call.emitData(utf8Encode(document))
      return Promise.resolve(404)
    })
    const taken = collectingSink()

    const response = await createHarmonyTransport({ http: fake }).send(request(), { sinkFactory: taken.factory })

    expect(response.statusCode).toBe(404)
    expect(taken.writes.length).toBe(0)
    expect(await response.body?.text()).toBe(document)
  })

  it('keeps a marked error document out of the sink, to read back as the response body', async () => {
    const document = '<Error><Code>NoSuchKey</Code><Message>not there</Message></Error>'
    const fake = fakeStreamModule((call) => {
      call.emitHeaders({ 'x-oss-request-id': 'req-1', 'x-oss-ec': '0003-00000101' })
      call.emitData(utf8Encode(document))
      return Promise.resolve(404)
    })
    const taken = collectingSink()

    const response = await createHarmonyTransport({ http: fake }).send(request(), { sinkFactory: taken.factory })

    expect(response.statusCode).toBe(404)
    expect(taken.writes.length).toBe(0)
    expect(await response.body?.text()).toBe(document)
  })

  // Without the marker the transport had no way to know, and by the time the status arrives the bytes
  // belong to the sink: the caller gets the status and an error with no document to read.
  it('gives an unmarked failure to the sink, and its status alone to the error', async () => {
    const document = '<Error><Code>NoSuchKey</Code><Message>not there</Message></Error>'
    const fake = fakeStreamModule((call) => {
      call.emitHeaders({ 'x-oss-request-id': 'req-1' })
      call.emitData(utf8Encode(document))
      return Promise.resolve(404)
    })
    const taken = collectingSink()

    const response = await createHarmonyTransport({ http: fake }).send(request(), { sinkFactory: taken.factory })

    expect(response.statusCode).toBe(404)
    expect(taken.text()).toBe(document)
    expect(await response.body?.bytes()).toEqual(new Uint8Array(0))
  })

  // A marked response is a failure whatever its length, so all of it stays with the error.
  it('keeps a marked failure of any size out of the sink', async () => {
    const document = '<Error><Code>NoSuchKey</Code><Message>' + 'x'.repeat(64 * 1024) + '</Message></Error>'
    const fake = fakeStreamModule((call) => {
      call.emitHeaders({ 'x-oss-ec': '0003-00000101' })
      for (const part of parts(document, 16 * 1024)) call.emitData(utf8Encode(part))
      return Promise.resolve(500)
    })
    const taken = collectingSink()

    const response = await createHarmonyTransport({ http: fake }).send(request(), { sinkFactory: taken.factory })

    expect(response.statusCode).toBe(500)
    expect(taken.writes.length).toBe(0)
    expect(await response.body?.text()).toBe(document)
  })

  // The sink's own refusal is what the caller hears. Whether another attempt is worth making is the
  // factory's decision, not the transport's, and a one-shot sink is how it says it is not.
  it('reports a sink that refuses bytes, and leaves the retry decision to the factory', async () => {
    const fake = fakeStreamModule((call) => {
      call.emitData(utf8Encode('a'.repeat(64 * 1024)))
      return Promise.resolve(200)
    })
    const taken = collectingSink(0)

    const error = await createHarmonyTransport({ http: fake })
      .send(request(), { sinkFactory: taken.factory })
      .then(() => undefined)
      .catch((err: unknown) => err as Error)

    expect(error?.message).toContain('the disk is full')
    expect(taken.factory.oneShot).toBe(true)
    expect(new ClientErrorRetryable().isErrorRetryable(error!)).toBe(false)
    expect(fake.destroyed).toBe(1)
  })

  // netstack cannot be slowed down, so a sink that stops taking bytes ends the transfer instead.
  it('ends the transfer when the sink falls behind, and says why', async () => {
    const fake = fakeStreamModule((call) => {
      call.emitHeaders({})
      for (let pushed = 0; pushed < 600; pushed++) call.emitData(new Uint8Array(16 * 1024))
      return Promise.resolve(200)
    })
    const stalled: ByteSink = { write: () => new Promise<void>(() => undefined) }

    const error = await createHarmonyTransport({ http: fake })
      .send(request(), { sinkFactory: toOneShotSinkFactory(stalled) })
      .then(() => undefined)
      .catch((err: unknown) => err as Error)

    expect(error).toBeInstanceOf(OssError)
    expect(error?.message).toContain('fell behind')
    expect(new ClientErrorRetryable().isErrorRetryable(error!)).toBe(false)
    expect(fake.destroyed).toBe(1)
  })

  it('destroys a streamed request and reports CanceledError when the signal fires', async () => {
    const fake = fakeStreamModule(() => new Promise<number>(() => undefined))
    const controller = controllable()
    const taken = collectingSink()

    const promise = createHarmonyTransport({ http: fake }).send(request(), {
      sinkFactory: taken.factory,
      signal: controller.signal,
    })
    controller.abort()

    await expect(promise).rejects.toBeInstanceOf(CanceledError)
    expect(fake.destroyed).toBe(1)
    expect(controller.listeners()).toBe(0)
  })

  // A transient netstack failure that reached no sink is still worth another attempt.
  it('retries a failure that delivered nothing to the sink', async () => {
    const fake = fakeStreamModule(() => Promise.reject(nativeError(2300007, 'Failed to connect')))
    const taken = collectingSink()

    const error = await createHarmonyTransport({ http: fake })
      .send(request(), { sinkFactory: taken.factory })
      .then(() => undefined)
      .catch((err: unknown) => err as Error)

    expect(error).toBeInstanceOf(RequestError)
    expect(new ClientErrorRetryable().isErrorRetryable(error!)).toBe(true)
    expect(taken.writes.length).toBe(0)
  })

  // The factory is what a sink is reached through, so this is the only way a caller learns the size upfront.
  it('asks the factory once, with what the response declared, and gives the sink back', async () => {
    const body = 'a'.repeat(64 * 1024) + 'tail'
    const fake = fakeStreamModule((call) => {
      // Given in platform case, handed to the factory lower-cased like every other reader of them.
      call.emitHeaders({ 'Content-Length': String(body.length), 'X-OSS-Request-Id': 'req-2' })
      for (const part of parts(body, 4096)) call.emitData(utf8Encode(part))
      return Promise.resolve(200)
    })
    const sizes: number[] = []
    const writes: Uint8Array[] = []
    let closes = 0
    let made = 0
    const factory: ByteSinkFactory = {
      oneShot: false,
      supplier(size: number, headers: Record<string, string>): ByteSink {
        made += 1
        sizes.push(size)
        expect(headers['x-oss-request-id']).toBe('req-2')
        return {
          write: (chunk: Uint8Array): void => {
            writes.push(chunk)
          },
          close: (): void => {
            closes += 1
          },
        }
      },
    }

    await createHarmonyTransport({ http: fake }).send(request(), { sinkFactory: factory })

    expect(made).toBe(1)
    expect(sizes).toEqual([body.length])
    expect(concatBytes(writes)).toEqual(utf8Encode(body))
    expect(closes).toBe(1)
  })

  // A caller sizes its sink from this number, so a declaration that is absent or unreadable says so.
  it('gives the factory -1 when the response declares no usable size', async () => {
    const sizes: number[] = []
    const factory: ByteSinkFactory = {
      oneShot: false,
      supplier(size: number): ByteSink {
        sizes.push(size)
        return { write: (): void => undefined }
      },
    }
    const without = fakeStreamModule((call) => {
      call.emitHeaders({ 'x-oss-request-id': 'req-2' })
      call.emitData(utf8Encode('body'))
      return Promise.resolve(200)
    })
    const unreadable = fakeStreamModule((call) => {
      call.emitHeaders({ 'content-length': 'unknown' })
      call.emitData(utf8Encode('body'))
      return Promise.resolve(200)
    })

    await createHarmonyTransport({ http: without }).send(request(), { sinkFactory: factory })
    await createHarmonyTransport({ http: unreadable }).send(request(), { sinkFactory: factory })

    expect(sizes).toEqual([-1, -1])
  })

  // A sink is only asked for once a byte needs one, which is what keeps a marked failure off the path.
  it('does not ask the factory for a marked failure', async () => {
    const fake = fakeStreamModule((call) => {
      call.emitHeaders({ 'x-oss-request-id': 'req-3', 'x-oss-ec': '0003-00000101' })
      call.emitData(utf8Encode('<Error><Code>NoSuchKey</Code></Error>'))
      return Promise.resolve(404)
    })
    let made = 0
    const factory: ByteSinkFactory = {
      oneShot: false,
      supplier(): ByteSink {
        made += 1
        return collectingSink().sink
      },
    }

    const response = await createHarmonyTransport({ http: fake }).send(request(), { sinkFactory: factory })

    expect(response.statusCode).toBe(404)
    expect(made).toBe(0)
  })

  // A replayable factory is only useful if the transport holds nothing between attempts.
  it('asks a replayable factory again on the next attempt', async () => {
    const fake = fakeStreamModule((call) => {
      call.emitData(utf8Encode('attempt'))
      return Promise.resolve(200)
    })
    const collected = [collectingSink(), collectingSink()]
    let made = 0
    const factory: ByteSinkFactory = {
      oneShot: false,
      supplier(): ByteSink {
        const next = collected[made]
        made += 1
        return next.sink
      },
    }

    await createHarmonyTransport({ http: fake }).send(request(), { sinkFactory: factory })
    await createHarmonyTransport({ http: fake }).send(request(), { sinkFactory: factory })

    expect(made).toBe(2)
    expect(collected[0].text()).toBe('attempt')
    expect(collected[1].text()).toBe('attempt')
  })

  it('leaves the buffered path alone when no sink is given', async () => {
    const fake = fakeStreamModule(() => Promise.resolve(200))

    await expect(createHarmonyTransport({ http: fake }).send(request(), {})).rejects.toThrow(
      'a sink is never served by the buffered path',
    )
    expect(fake.calls.length).toBe(0)
  })
})

describe('createHarmonyTransport platform', () => {
  it('omits it, since naming the device needs a second @ohos. module', () => {
    expect(createHarmonyTransport({ http: fakeModule(replyWith('')) }).platform).toBeUndefined()
  })

  it('cannot stream the request body: netstack takes it whole', () => {
    expect(createHarmonyTransport({ http: fakeModule(replyWith('')) }).canStreamUpload).toBe(false)
  })

  // netstack's own content-type default arrives after signing, so the client has to settle it first.
  it('reports that it fills a missing content-type and takes a sink factory', () => {
    expect(createHarmonyTransport({ http: fakeModule(replyWith('')) }).capabilities).toEqual([
      TransportCapabilityType.FILLS_CONTENT_TYPE,
      TransportCapabilityType.SINK_FACTORY,
    ])
  })
})
