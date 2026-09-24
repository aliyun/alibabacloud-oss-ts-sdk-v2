import netstack from '@ohos.net.http'
import type {
  RequestMessage,
  ResponseMessage,
  HttpTransport,
  HttpTransportOptions,
  ByteContent,
  RequestOptions,
} from '../../transport/types.js'
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
  /** An `ArrayBuffer` when `expectDataType` is `ARRAY_BUFFER`. */
  result: string | ArrayBuffer | object
}

/** netstack's `DataSendProgressInfo`: both counts are cumulative totals, not per-chunk deltas. */
export interface DataSendProgressInfo {
  sendSize: number
  totalSize: number
}

/** One netstack request handle, as `createHttp()` returns. */
export interface HttpRequest {
  request(url: string, options: HarmonyRequestOptions): Promise<HttpResponse>
  /** Fires as the buffered body drains to the socket; the running `sendSize` is a cumulative total. */
  on(type: 'dataSendProgress', callback: (info: DataSendProgressInfo) => void): void
  off(type: 'dataSendProgress', callback?: (info: DataSendProgressInfo) => void): void
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

function responseBytes(result: string | ArrayBuffer | object): Uint8Array {
  if (typeof result === 'string') return utf8Encode(result)
  if (result instanceof ArrayBuffer) return new Uint8Array(result)
  throw new DeserializationError('unexpected response body from @ohos.net.http: expected an ArrayBuffer or a string')
}

const CONTENT_TYPE = 'content-type'

/** Copies request headers and supplies an empty content type for body-capable methods. */
function requestHeaders(request: RequestMessage): Record<string, string> {
  const headers = request.headers.toRecord()
  let hasContentType = false
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === CONTENT_TYPE) hasContentType = true
  }
  const method = request.method
  if (!hasContentType && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
    headers[CONTENT_TYPE] = ''
  }
  return headers
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
 * 1. **Bodies are buffered in both directions,** and a response is capped at 100 MiB. A one-shot
 *    `StreamContent` request body raises `SerializationError`; a replayable body (bytes, string, or a
 *    `FileContent`) is drained into memory and sent whole, and a larger object needs ranged requests.
 *    Upload progress is still observable: netstack reports the buffered body draining to the socket.
 * 2. **`readWriteTimeoutMs` is ignored.** netstack exposes a whole-transfer deadline rather than an
 *    idle deadline; a total request budget can be supplied through `signal`.
 * 3. **The `User-Agent` names no platform.** `Config.userAgent` does reach the network.
 * 4. **Only an unauthenticated HTTP proxy is honoured.** `proxyHost` schemes and credentials are ignored.
 * 5. **`insecureSkipVerify` is ignored:** skipping certificate verification is compile-gated in
 *    netstack and not reachable from the JS API, so verification always runs.
 * 6. **`enabledRedirect` is ignored:** netstack follows redirects unconditionally and offers no toggle.
 */
export function createHarmonyTransport(options?: HarmonyTransportOptions): HttpTransport {
  const http = options?.http ?? netstack
  const connectTimeoutMs = options?.connectTimeoutMs
  const usingProxy = options?.proxyHost !== undefined ? parseProxy(options.proxyHost) : undefined
  return {
    canStreamUpload: false,
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
        header: requestHeaders(request),
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

      let response: HttpResponse
      try {
        response = await client.request(request.url, requestOptions)
      } catch (error) {
        if (failure !== undefined) throw failure
        if (!(error instanceof Error)) throw error
        throw translateNativeError(error)
      } finally {
        if (signal !== undefined) signal.removeEventListener('abort', onAbort)
        if (onSend !== undefined) client.off('dataSendProgress', onSend)
        destroy()
      }

      return {
        status: '',
        statusCode: response.responseCode,
        headers: normalizeHeaders(response.header),
        body: bufferedBody(responseBytes(response.result)),
      }
    },
  }
}
