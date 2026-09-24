import {
  Agent as HttpAgent,
  request as httpRequest,
  type ClientRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
} from 'node:http'
import { Agent as HttpsAgent, request as httpsRequest, type RequestOptions } from 'node:https'
import * as process from 'node:process'
import { Readable, Transform, type TransformCallback } from 'node:stream'
import { clearTimeout, setTimeout } from 'node:timers'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { CanceledError, RequestError } from '../../error/types.js'
import type {
  RequestMessage,
  ResponseMessage,
  HttpTransport,
  HttpTransportOptions,
  ByteContent,
  ByteSource,
  ResponseBody,
  RequestOptions as SendOptions,
  StreamLike,
} from '../../transport/types.js'
import { allowsStreaming, bufferedBody } from '../../transport/buffered-body.js'
import { BytesContent, StringContent } from '../../transport/content.js'
import { concatBytes, utf8Decode } from '../../utils/bytes.js'
import { fromReadable } from './stream.js'

/** The settings the node transport is built with, on top of the network ones every platform takes. */
export interface NodeTransportOptions extends HttpTransportOptions {
  /** Reuse sockets across requests. Default `true`. */
  keepAlive?: boolean
  /** Per-host socket ceiling. Default 100; node's own default is unbounded (`Infinity`). */
  maxConnections?: number
}

/** The `<os>/-/<arch>;<runtime><version>` segment of the User-Agent, e.g. `darwin/-/arm64;node20.11.0`. */
function nodePlatform(): string {
  return process.platform + '/-/' + process.arch + ';node' + process.versions.node
}

function lowerCaseHeaders(raw: IncomingHttpHeaders): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const name of Object.keys(raw)) {
    const value = raw[name]
    if (value === undefined) continue
    // Node lowercases header names and returns `set-cookie` as an array.
    headers[name] = typeof value === 'string' ? value : value.join(', ')
  }
  return headers
}

async function collect(readable: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  for await (const chunk of readable) parts.push(chunk)
  return concatBytes(parts)
}

/** Wraps an `IncomingMessage` as a `ResponseBody` and translates read failures. */
function nodeResponseBody(body: IncomingMessage, translate: (error: unknown) => Error): ResponseBody {
  let buffered: Promise<Uint8Array> | undefined
  const bytes = (): Promise<Uint8Array> => {
    // An `IncomingMessage` is buffered at most once.
    if (buffered === undefined) {
      buffered = collect(body).catch((error: unknown) => {
        throw translate(error)
      })
    }
    return buffered
  }
  return {
    bytes,
    text: async (): Promise<string> => utf8Decode(await bytes()),
    stream: (): StreamLike => {
      const inner = fromReadable(body)
      return {
        read: (): Promise<Uint8Array | null> =>
          inner.read().catch((error: unknown) => {
            throw translate(error)
          }),
      }
    },
  }
}

/** A libuv or DNS failure, as node reports it. Reading `code` is this file's business. */
interface NodeSyscallError extends Error {
  code?: string
}

/** Node failure codes translated to retryable `RequestError`s. */
const RETRYABLE_NODE_CODES = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'EPIPE',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENETRESET',
  'ENETDOWN',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EAGAIN',
]

function wrapNodeError(error: Error): Error {
  const syscall: NodeSyscallError = error
  const code = syscall.code
  if (code === undefined || RETRYABLE_NODE_CODES.indexOf(code) < 0) return error
  return new RequestError(error.message, error)
}

/**
 * Creates shared HTTP and HTTPS agents. A `proxyHost` uses matching proxy agents, and proxy URL
 * credentials become a `Proxy-Authorization` header.
 */
function createAgents(options?: NodeTransportOptions): { http: HttpAgent; https: HttpAgent } {
  const keepAlive = options?.keepAlive !== false
  const maxSockets = options?.maxConnections ?? 100
  const proxyHost = options?.proxyHost
  if (proxyHost === undefined || proxyHost.length === 0) {
    return { http: new HttpAgent({ keepAlive, maxSockets }), https: new HttpsAgent({ keepAlive, maxSockets }) }
  }
  const url = new URL(proxyHost)
  const headers: Record<string, string> = {}
  if (url.username.length > 0) {
    const auth = decodeURIComponent(url.username) + ':' + decodeURIComponent(url.password)
    headers['proxy-authorization'] = 'Basic ' + Buffer.from(auth).toString('base64')
  }
  const rejectUnauthorized = options?.insecureSkipVerify !== true
  const agentOptions = { keepAlive, maxSockets, headers, rejectUnauthorized }
  return { http: new HttpProxyAgent(url.origin, agentOptions), https: new HttpsProxyAgent(url.origin, agentOptions) }
}

/**
 * Sends requests over `node:http`/`node:https`, on node 22 and later (`engines.node: ">=22.0.0"`).
 * Redirects are not followed, and `enabledRedirect` is a no-op.
 *
 * ```ts
 * const client = new Client({ region: 'cn-hangzhou', credentialsProvider, transport: createNodeTransport() })
 * ```
 */
export function createNodeTransport(options?: NodeTransportOptions): HttpTransport {
  const agents = createAgents(options)
  const rejectUnauthorized = options?.insecureSkipVerify !== true
  const connectTimeoutMs = options?.connectTimeoutMs
  const builtIdle = options?.readWriteTimeoutMs

  return {
    platform: nodePlatform(),
    canStreamUpload: true,
    send(request: RequestMessage, sendOptions: SendOptions): Promise<ResponseMessage> {
      const external = sendOptions.signal
      if (external !== undefined && external.aborted) return Promise.reject(new CanceledError())

      return new Promise<ResponseMessage>((resolve, reject) => {
        const url = new URL(request.url)
        const isSSL = url.protocol === 'https:'
        const headers = request.headers.toRecord()
        const body = request.body
        if (
          body !== undefined &&
          body.length !== undefined &&
          !(body instanceof BytesContent) &&
          !(body instanceof StringContent) &&
          request.headers.get('content-length') === undefined
        ) {
          headers['Content-Length'] = String(body.length)
        }
        const reqOptions: RequestOptions = {
          method: request.method,
          headers,
          agent: isSSL ? agents.https : agents.http,
          rejectUnauthorized,
        }

        let settled = false
        let cleaned = false
        let failure: Error | undefined
        let connectTimer: NodeJS.Timeout | undefined

        const idle = sendOptions.readWriteTimeoutMs ?? builtIdle

        const translate = (error: unknown): Error => {
          if (failure !== undefined) return failure
          if (!(error instanceof Error)) return new Error(String(error))
          return wrapNodeError(error)
        }

        const cleanup = (): void => {
          if (cleaned) return
          cleaned = true
          if (connectTimer !== undefined) clearTimeout(connectTimer)
          req.removeListener('timeout', onIdle)
          if (external !== undefined) external.removeEventListener('abort', onAbort)
        }

        const rejectOnce = (error: Error): void => {
          if (settled) return
          settled = true
          cleanup()
          reject(error)
        }

        const fail = (error: Error): void => {
          if (failure === undefined) failure = error
          req.destroy()
          rejectOnce(failure)
        }

        const onIdle = (): void =>
          fail(new RequestError('socket timed out: no data transferred for ' + String(idle) + 'ms'))
        const onAbort = (): void => fail(new CanceledError())

        const onResponse = (res: IncomingMessage): void => {
          const envelope = (body: ResponseBody): ResponseMessage => ({
            // node preserves the reason phrase the server sent, unlike a header-only stack.
            status: res.statusMessage ?? '',
            statusCode: res.statusCode ?? -1,
            headers: lowerCaseHeaders(res.headers),
            body,
          })

          // Only a 2xx other than 203 streams when asked; every other body is read before send
          // resolves.
          if (allowsStreaming(sendOptions.responseStream, res.statusCode ?? -1)) {
            settled = true
            res.on('close', cleanup)
            resolve(envelope(nodeResponseBody(res, translate)))
            return
          }

          collect(res).then(
            (bytes: Uint8Array): void => {
              settled = true
              cleanup()
              resolve(envelope(bufferedBody(bytes)))
            },
            (error: unknown): void => rejectOnce(translate(error)),
          )
        }

        const requestFn = isSSL ? httpsRequest : httpRequest
        const req: ClientRequest = requestFn(url, reqOptions, onResponse)

        req.on('error', (error: Error) => rejectOnce(translate(error)))

        if (connectTimeoutMs !== undefined) {
          req.on('socket', (socket) => {
            if (!socket.connecting) return
            connectTimer = setTimeout(
              () =>
                fail(new RequestError('connect timed out: no connection within ' + String(connectTimeoutMs) + 'ms')),
              connectTimeoutMs,
            )
            const clear = (): void => {
              if (connectTimer !== undefined) clearTimeout(connectTimer)
              connectTimer = undefined
            }
            socket.once(isSSL ? 'secureConnect' : 'connect', clear)
          })
        }

        if (idle !== undefined) {
          req.setTimeout(idle)
          req.on('timeout', onIdle)
        }

        if (external !== undefined) external.addEventListener('abort', onAbort)

        writeBody(req, request.body, sendOptions.progressReporter)
      })
    },
  }
}

/** A pass-through upload transform that reports each chunk to `onChunk`. */
export class BodyTap extends Transform {
  private readonly onChunk?: (chunk: Uint8Array) => void

  constructor(onChunk?: (chunk: Uint8Array) => void) {
    super()
    this.onChunk = onChunk
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    if (this.onChunk !== undefined) this.onChunk(chunk)
    callback(null, chunk)
  }
}

/**
 * Sends bytes and strings through `req.end()` and pumps other content from its `source()` cursor
 * through a `BodyTap`. A source failure destroys the request with the same error.
 */
function writeBody(req: ClientRequest, body: ByteContent | undefined, reporter?: (increment: number) => void): void {
  if (body === undefined) {
    req.end()
    return
  }
  if (body instanceof StringContent || body instanceof BytesContent) {
    const bytes = body.bytes
    reporter?.(bytes.byteLength)
    req.end(bytes.byteLength > 0 ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) : Buffer.alloc(0))
    return
  }
  const source = Readable.from(pump(body.source()))
  source.on('error', (error: Error) => req.destroy(error))
  // Closing the request also closes the body source.
  req.on('close', () => source.destroy())
  source.pipe(new BodyTap(reporter === undefined ? undefined : (chunk) => reporter(chunk.byteLength))).pipe(req)
}

async function* pump(source: ByteSource): AsyncGenerator<Uint8Array> {
  try {
    for (;;) {
      const chunk = await source.read()
      if (chunk === null) return
      yield chunk
    }
  } finally {
    await source.cancel?.()
  }
}
