import netstack from '@ohos.net.http'
import type {
  RequestMessage,
  ResponseMessage,
  HttpTransport,
  HttpTransportOptions,
  ByteContent,
  ByteSink,
  ByteSinkFactory,
  RequestOptions,
} from '../../transport/types.js'
import { TransportCapabilityType } from '../../transport/types.js'
import {
  CanceledError,
  DeserializationError,
  OssError,
  RequestError,
  SerializationError,
} from '../../error/types.js'
import { concatBytes, utf8Encode } from '../../utils/bytes.js'
import { BytesContent, StringContent } from '../../transport/content.js'
import { bufferedBody } from '../../transport/buffered-body.js'
import { normalizeHeaders, type RawHeaders } from './headers.js'

const MAX_RESPONSE_BYTES = 100 * 1024 * 1024

/** How far a sink may fall behind before the transfer is given up on: netstack cannot be slowed down. */
const SINK_QUEUE_BYTES = 8 * 1024 * 1024

/** The subset of `@ohos.net.http` request options this transport sets. */
export interface HarmonyRequestOptions {
  method: string
  /** Singular, matching `@ohos.net.http`. */
  header: Record<string, string>
  extraData?: string | ArrayBufferLike
  expectDataType: number
  connectTimeout?: number
  readTimeout: number
  maxLimit: number
  usingProxy?: HarmonyHttpProxy
}

/** netstack's proxy options: host, port, and directly reached hosts. */
export interface HarmonyHttpProxy {
  host: string
  port: number
  exclusionList: string[]
}

/** What `request` resolves with. */
export interface HttpResponse {
  responseCode: number
  header: RawHeaders
  /** An `ArrayBuffer` when `expectDataType` is `ARRAY_BUFFER`. An empty body arrives as `null` or `undefined`. */
  result: string | ArrayBuffer | object | null | undefined
}

/** netstack's `DataSendProgressInfo`: both counts are cumulative totals, not per-chunk deltas. */
export interface DataSendProgressInfo {
  sendSize: number
  totalSize: number
}

/** One netstack request handle, as `createHttp()` returns. */
export interface HttpRequest {
  request(url: string, options: HarmonyRequestOptions): Promise<HttpResponse>
  /**
   * Sends the same request and hands the body over through `dataReceive` instead of buffering it.
   * Resolves with the status code once the whole body has been pushed to the listeners, so a consumer
   * has to be listening before this is awaited -- taking the bytes afterwards would be too late.
   */
  requestInStream(url: string, options: HarmonyRequestOptions): Promise<number>
  /** Fires as the buffered body drains to the socket; the running `sendSize` is a cumulative total. */
  on(type: 'dataSendProgress', callback: (info: DataSendProgressInfo) => void): void
  off(type: 'dataSendProgress', callback?: (info: DataSendProgressInfo) => void): void
  /** Fires once with the response headers. The payload is the header map alone, with no status code. */
  on(type: 'headersReceive', callback: (header: RawHeaders) => void): void
  off(type: 'headersReceive', callback?: (header: RawHeaders) => void): void
  /** Fires per chunk in streaming mode, with about 16 KiB each time, as netstack reads them off the socket. */
  on(type: 'dataReceive', callback: (chunk: ArrayBuffer) => void): void
  off(type: 'dataReceive', callback?: (chunk: ArrayBuffer) => void): void
  /** The only way to abort an in-flight request, and the handle release. */
  destroy(): void
}

/** The member of netstack's `HttpDataType` enum used by this transport. */
export interface HarmonyHttpDataType {
  readonly ARRAY_BUFFER: number
}

/** As much of `@ohos.net.http`'s default export as this transport uses. */
export interface HarmonyHttpModule {
  createHttp(): HttpRequest
  HttpDataType: HarmonyHttpDataType
}

/** The settings this transport is built with, on top of the network ones every platform takes. */
export interface HarmonyTransportOptions extends HttpTransportOptions {
  /** Defaults to `@ohos.net.http`. Pass an adapter of your own to drive a different handle. */
  http?: HarmonyHttpModule
}

/** A netstack `BusinessError`. */
interface NativeError extends Error {
  code?: number | string
}

const RETRYABLE_NETSTACK_CODES = [
  2300005, // CURLE_COULDNT_RESOLVE_PROXY
  2300006, // CURLE_COULDNT_RESOLVE_HOST
  2300007, // CURLE_COULDNT_CONNECT
  2300016, // CURLE_HTTP2
  2300018, // CURLE_PARTIAL_FILE
  2300028, // CURLE_OPERATION_TIMEDOUT
  2300035, // CURLE_SSL_CONNECT_ERROR
  2300052, // CURLE_GOT_NOTHING
  2300055, // CURLE_SEND_ERROR
  2300056, // CURLE_RECV_ERROR
  2300080, // CURLE_SSL_SHUTDOWN_FAILED
  2300092, // CURLE_HTTP2_STREAM
]

/**
 * Rewrites a netstack failure into one the retryer can judge and the reader can act on, or returns it
 * untouched when there is nothing useful to say. The original is kept as `cause`.
 */
function translateNativeError(error: Error): Error {
  const native: NativeError = error
  const code = Number(native.code)
  const suffix = ' (@ohos.net.http BusinessError ' + String(code) + ': ' + native.message + ')'
  if (RETRYABLE_NETSTACK_CODES.indexOf(code) >= 0) {
    return new RequestError('the request did not complete' + suffix, native)
  }
  if (code === 2300023) {
    return new OssError(
      'the response body exceeded this platform limit of ' +
        String(MAX_RESPONSE_BYTES) +
        ' bytes, which is the maximum @ohos.net.http accepts; fetch large objects with a ranged request' +
        suffix,
      native,
    )
  }
  return error
}

/** The five methods netstack refuses to put a body on, folding their `extraData` into the URL instead. */
const BODYLESS_METHODS = ['GET', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT']

/** Materializes replayable request bodies and rejects unsupported body forms. */
function extraData(
  method: string,
  body: ByteContent | undefined,
): string | ArrayBufferLike | undefined | Promise<ArrayBufferLike> {
  if (body === undefined) return undefined
  if (BODYLESS_METHODS.indexOf(method) >= 0) {
    throw new SerializationError(
      'this runtime cannot send a request body on ' +
        method +
        ': @ohos.net.http appends it to the query string instead of sending it, which would invalidate the signature',
    )
  }
  if (body.oneShot) {
    throw new SerializationError(
      'this runtime cannot stream a request body: @ohos.net.http takes the whole body up front. Pass a Uint8Array, a string, or a FileContent.',
    )
  }
  if (body instanceof BytesContent || body instanceof StringContent) {
    return new Uint8Array(body.bytes).buffer
  }
  return drain(body)
}

/** Drains a replayable cursor-only `ByteContent` into one contiguous buffer. */
async function drain(body: ByteContent): Promise<ArrayBufferLike> {
  const source = body.source()
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const chunk = await source.read()
      if (chunk === null) break
      chunks.push(chunk)
    }
  } finally {
    await source.cancel?.()
  }
  return concatBytes(chunks).buffer
}

function responseBytes(result: string | ArrayBuffer | object | null | undefined): Uint8Array {
  // netstack reports a response that carries no body as null or undefined.
  if (result === undefined || result === null) return new Uint8Array(0)
  if (typeof result === 'string') return utf8Encode(result)
  if (result instanceof ArrayBuffer) return new Uint8Array(result)
  if (ArrayBuffer.isView(result)) return new Uint8Array(result.buffer, result.byteOffset, result.byteLength)
  throw new DeserializationError('unexpected response body from @ohos.net.http: expected an ArrayBuffer or a string')
}

/**
 * Fills a `ByteSink` from netstack's streaming events, one sink per HTTP attempt. This platform reports the
 * status only after the body, so the headers decide where the bytes go: one marked as a failure keeps its
 * body aside as an error document, and anything else reaches the sink as the push it arrived in. Writes are
 * chained, so they land in order.
 */
class SinkPump {
  /** Why the sink stopped taking bytes, if it did. */
  failure: Error | undefined

  private readonly factory: ByteSinkFactory
  /** The normalized response headers, which `headersReceive` hands over before any body byte does. */
  private readonly responseHeaders: () => Record<string, string>
  /** Ends the transfer, which is the only way to stop netstack. */
  private readonly abortTransfer: () => void
  /** The sink for this attempt, made the first time a byte needs it and released by `close`. */
  private sink: ByteSink | undefined
  /** Whether the headers said this response is a failure, whose body belongs to the error and not the sink. */
  private marked = false
  private errorDoc: Uint8Array[] = []
  private queued: Uint8Array[] = []
  private queuedBytes = 0
  private writes: Promise<void> = Promise.resolve()

  constructor(factory: ByteSinkFactory, responseHeaders: () => Record<string, string>, abortTransfer: () => void) {
    this.factory = factory
    this.responseHeaders = responseHeaders
    this.abortTransfer = abortTransfer
  }

  /** Reads what the headers say about the body, ahead of the first byte. */
  onHeaders(): void {
    this.marked = this.responseHeaders()['x-oss-ec'] !== undefined
  }

  /** Takes one `dataReceive` chunk: to the sink, or kept whole as the document when the headers marked one. */
  onData(chunk: ArrayBuffer): void {
    if (this.failure !== undefined) return
    const bytes = responseBytes(chunk)
    if (this.marked) {
      this.errorDoc.push(bytes)
      return
    }
    this.enqueue(bytes)
  }

  /** The body the sink did not take: the error document when marked, nothing when the sink holds it all. */
  errorBody(): Uint8Array | undefined {
    return this.marked ? concatBytes(this.errorDoc) : undefined
  }

  /** Ends the attempt: every byte the sink was to take had already been handed over. */
  async settle(): Promise<void> {
    await this.writes
    await this.close()
  }

  /** Gives the sink back, whichever way the attempt ended; the next attempt gets a fresh one. */
  async close(): Promise<void> {
    const sink = this.sink
    this.sink = undefined
    if (sink === undefined) return
    try {
      await sink.close?.()
    } catch (error) {
      this.fail(error instanceof Error ? error : new OssError('the response sink closed with a value that was not an Error'))
    }
  }

  private enqueue(bytes: Uint8Array): void {
    if (this.open() === undefined) return
    this.queued.push(bytes)
    this.queuedBytes += bytes.byteLength
    this.writes = this.writes.then(() => this.drain())
    if (this.queuedBytes > SINK_QUEUE_BYTES) {
      this.fail(new OssError('the response sink fell behind the transfer, which cannot be slowed down on this platform'))
    }
  }

  /** The sink for this attempt, made on the first byte that needs one, or `undefined` if making it failed. */
  private open(): ByteSink | undefined {
    if (this.sink !== undefined) return this.sink
    if (this.failure !== undefined) return undefined
    try {
      const headers = this.responseHeaders()
      this.sink = this.factory.supplier(sizeOf(headers), headers)
    } catch (error) {
      this.fail(error instanceof Error ? error : new OssError('the sink factory threw a value that was not an Error'))
      return undefined
    }
    return this.sink
  }

  /** Hands each queued push to the sink in turn, until the queue empties or the sink fails. */
  private async drain(): Promise<void> {
    while (this.failure === undefined) {
      const next = this.queued.shift()
      if (next === undefined) return
      this.queuedBytes -= next.byteLength
      const sink = this.sink
      if (sink === undefined) return
      try {
        await sink.write(next)
      } catch (error) {
        this.fail(error instanceof Error ? error : new OssError('the response sink threw a value that was not an Error'))
      }
    }
  }

  private fail(error: Error): void {
    if (this.failure !== undefined) return
    this.failure = error
    this.abortTransfer()
  }
}

/** The size of the object the response declared, or `-1` when `content-length` is missing or will not parse. */
function sizeOf(headers: Record<string, string>): number {
  const declared = headers['content-length']
  if (declared === undefined || declared.length === 0) return -1
  const size = Number(declared)
  return Number.isInteger(size) && size >= 0 ? size : -1
}

/** Parses a proxy host and port, ignoring schemes, credentials, and paths. */
function parseProxy(proxyHost: string): HarmonyHttpProxy | undefined {
  let rest = proxyHost.trim()
  if (rest.length === 0) return undefined

  const scheme = rest.indexOf('://')
  if (scheme >= 0) rest = rest.slice(scheme + 3)

  const path = rest.indexOf('/')
  if (path >= 0) rest = rest.slice(0, path)
  const at = rest.lastIndexOf('@')
  if (at >= 0) rest = rest.slice(at + 1)

  const colon = rest.lastIndexOf(':')
  const host = colon >= 0 ? rest.slice(0, colon) : rest
  const port = colon >= 0 ? Number(rest.slice(colon + 1)) : 80
  if (host.length === 0 || !Number.isInteger(port) || port <= 0) return undefined

  return { host, port, exclusionList: [] }
}

/**
 * The HTTP transport over `@ohos.net.http`. A `Config` on this platform needs no `transport`; pass
 * `options.http` to drive a different handle.
 *
 * Platform limitations:
 *
 * 1. **Request bodies are buffered,** and a buffered response is capped at 100 MiB. A one-shot
 *    `StreamContent` request body raises `SerializationError`; a replayable body (bytes, string, or a
 *    `FileContent`) is drained into memory and sent whole, and a larger object needs ranged requests.
 *    Upload progress is still observable: netstack reports the buffered body draining to the socket. A
 *    response with a `sinkFactory` is not buffered and takes no platform size limit.
 * 2. **`readWriteTimeoutMs` is ignored.** netstack exposes a whole-transfer deadline rather than an
 *    idle deadline; a total request budget can be supplied through `signal`.
 * 3. **The `User-Agent` names no platform.** `Config.userAgent` does reach the network.
 * 4. **Only an unauthenticated HTTP proxy is honoured.** `proxyHost` schemes and credentials are ignored.
 * 5. **`insecureSkipVerify` is ignored:** skipping certificate verification is compile-gated in
 *    netstack and not reachable from the JS API, so verification always runs.
 * 6. **`enabledRedirect` is ignored:** netstack follows redirects unconditionally and offers no toggle.
 * 7. **netstack supplies a `Content-Type` of its own** on POST, PUT and DELETE when the request has
 *    none, so the transport reports `TransportCapabilityType.FILLS_CONTENT_TYPE` and the client signs
 *    an empty one on every request it sends. A url it presigns signs no content type of its own.
 * 8. **A streamed response reports its status last.** `requestInStream` settles once the whole body has
 *    been handed over and `headersReceive` carries no status code, so the headers route the bytes instead:
 *    an `x-oss-ec`, which OSS gives every failure, keeps the body out of the sink as its error document,
 *    and anything else streams straight to the sink. A failure that carries no marker is therefore written
 *    to the caller's sink and reported as its status alone. The factory sees the headers and the declared
 *    length, never the status; whether a failed attempt is replayed is its `oneShot`.
 */
export function createHarmonyTransport(options?: HarmonyTransportOptions): HttpTransport {
  const http = options?.http ?? netstack
  const connectTimeoutMs = options?.connectTimeoutMs
  const usingProxy = options?.proxyHost !== undefined ? parseProxy(options.proxyHost) : undefined
  return {
    canStreamUpload: false,
    capabilities: [TransportCapabilityType.FILLS_CONTENT_TYPE, TransportCapabilityType.SINK_FACTORY],
    async send(request: RequestMessage, options: RequestOptions): Promise<ResponseMessage> {
      const signal = options.signal
      if (signal !== undefined && signal.aborted) throw new CanceledError()

      const prepared = extraData(request.method, request.body)
      let data: string | ArrayBufferLike | undefined
      if (prepared instanceof Promise) {
        data = await prepared
        if (signal !== undefined && signal.aborted) throw new CanceledError()
      } else {
        data = prepared
      }
      const client = http.createHttp()

      let destroyed = false
      const destroy = (): void => {
        if (destroyed) return
        destroyed = true
        client.destroy()
      }

      let failure: Error | undefined
      const onAbort = (): void => {
        failure = new CanceledError()
        destroy()
      }
      if (signal !== undefined) signal.addEventListener('abort', onAbort)

      const requestOptions: HarmonyRequestOptions = {
        method: request.method,
        header: request.headers.toRecord(),
        extraData: data,
        expectDataType: http.HttpDataType.ARRAY_BUFFER,
        maxLimit: MAX_RESPONSE_BYTES,
        readTimeout: 0,
      }
      if (connectTimeoutMs !== undefined) requestOptions.connectTimeout = connectTimeoutMs
      if (usingProxy !== undefined) requestOptions.usingProxy = usingProxy

      const reporter = options.progressReporter
      let onSend: ((info: DataSendProgressInfo) => void) | undefined
      if (reporter !== undefined && data !== undefined) {
        let lastSent = 0
        onSend = (info: DataSendProgressInfo): void => {
          const increment = info.sendSize - lastSent
          lastSent = info.sendSize
          if (increment > 0) reporter(increment)
        }
        client.on('dataSendProgress', onSend)
      }

      let responseHeaders: Record<string, string> | undefined
      // Normalized once, where it arrives: the failure marker, the sink factory, and the response all read
      // this one map.
      const readHeaders = (): Record<string, string> => responseHeaders ?? {}
      const factory = options.sinkFactory
      const pump = factory === undefined ? undefined : new SinkPump(factory, readHeaders, destroy)
      let onHeaders: ((header: RawHeaders) => void) | undefined
      let onData: ((chunk: ArrayBuffer) => void) | undefined
      if (pump !== undefined) {
        onHeaders = (header: RawHeaders): void => {
          responseHeaders = normalizeHeaders(header)
          // The one chance to know a response is a failure before its bytes arrive.
          pump.onHeaders()
        }
        onData = (chunk: ArrayBuffer): void => {
          if (pump !== undefined) pump.onData(chunk)
        }
        client.on('headersReceive', onHeaders)
        client.on('dataReceive', onData)
      }

      let statusCode = 0
      let bodyBytes: Uint8Array | undefined
      try {
        if (pump === undefined) {
          const response = await client.request(request.url, requestOptions)
          statusCode = response.responseCode
          responseHeaders = normalizeHeaders(response.header)
          bodyBytes = responseBytes(response.result)
        } else {
          statusCode = await client.requestInStream(request.url, requestOptions)
          await pump.settle()
          const sinkFailure = pump.failure
          if (sinkFailure !== undefined) throw sinkFailure
          // A marked failure keeps its document for the error path; the sink holds every other body.
          bodyBytes = pump.errorBody()
        }
      } catch (error) {
        if (failure !== undefined) throw failure
        // A sink that stopped taking bytes is the real failure, not netstack's report of the teardown.
        const reason = pump !== undefined && pump.failure !== undefined ? pump.failure : error
        if (!(reason instanceof Error)) throw reason
        throw translateNativeError(reason)
      } finally {
        if (signal !== undefined) signal.removeEventListener('abort', onAbort)
        if (onSend !== undefined) client.off('dataSendProgress', onSend)
        if (onHeaders !== undefined) client.off('headersReceive', onHeaders)
        if (onData !== undefined) client.off('dataReceive', onData)
        destroy()
        // A sink already made has to be given back even though the attempt failed.
        if (pump !== undefined) await pump.close()
      }

      return {
        status: '',
        statusCode: statusCode,
        headers: readHeaders(),
        // A streamed body left through the sink, so the returned one is empty by design.
        body: bufferedBody(bodyBytes ?? new Uint8Array(0)),
      }
    },
  }
}
