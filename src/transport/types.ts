import type { AbortSignalLike } from '../utils/abort.js'

/** Minimal pull-stream contract. */
export interface StreamLike {
  /** Resolves to the next chunk, or `null` once the stream is exhausted. */
  read(): Promise<Uint8Array | null>
  /**
   * Releases the underlying resource when a cursor is abandoned. Optional, idempotent and a no-op
   * after exhaustion or cancellation. May return a promise.
   */
  cancel?(): void | Promise<void>
}

/** A single-pass read cursor over a request or response body. */
export type ByteSource = StreamLike

/** A request body descriptor that can hand out a fresh cursor per attempt. */
export interface ByteContent {
  /**
   * Byte length, or `undefined` when unknown. Known -> the core writes `Content-Length`; unknown ->
   * chunked transfer, which only the node transport can send.
   */
  readonly length: number | undefined
  /** `true` when the body can be consumed only once, so a failed attempt cannot be retried. */
  readonly oneShot: boolean
  /** Opens a new cursor that reads from the start. */
  source(): ByteSource
}

/** What an operation may send as a body. Bytes and strings are sugar; everything else is a `ByteContent`. */
export type RequestBody = Uint8Array | string | ByteContent

/** A case-insensitive header store for the request side, keyed by the lowercase name. */
export interface HeaderFields {
  get(name: string): string | undefined
  set(name: string, value: string): void
  /** `{ originalName: value }`, the form a transport puts on the wire. */
  toRecord(): Record<string, string>
  /** `{ lowercaseName: value }`, already normalized and single-spelling for the signer. */
  toNormalizedRecord(): Record<string, string>
}

/** A response body, readable once in whichever of the three shapes the caller wants. */
export interface ResponseBody {
  bytes(): Promise<Uint8Array>
  text(): Promise<string>
  stream(): StreamLike
}

/** A request as the transport takes it. */
export interface RequestMessage {
  method: string
  url: string
  headers: HeaderFields
  body?: ByteContent
}

/** A response as the transport returns it. */
export interface ResponseMessage {
  /** HTTP reason phrase, such as `Not Found`. Empty when the platform does not provide one. */
  status: string
  statusCode: number
  headers: Record<string, string>
  body?: ResponseBody
}

/** Network settings used to construct a transport. Unsupported settings are ignored. */
export interface HttpTransportOptions {
  /** Deadline for the connection alone: the name lookup and the handshake, nothing after. */
  connectTimeoutMs?: number
  /** Idle deadline between chunks, which a single send may override. */
  readWriteTimeoutMs?: number
  /** A proxy URL such as `http://user:pass@10.0.0.1:3128`. A platform that cannot route through one ignores it. */
  proxyHost?: string
  /** Skips server-certificate verification. A platform that cannot control verification ignores it. */
  insecureSkipVerify?: boolean
  /** Follows HTTP redirects. A platform that cannot toggle redirect following ignores it. */
  enabledRedirect?: boolean
}

/** The per-send knobs every transport honours as far as its platform allows. */
export interface RequestOptions {
  /**
   * Overrides the idle deadline the transport was built with, for this send alone. Best-effort: no
   * platform offers it directly, and OpenHarmony cannot express it at all.
   */
  readWriteTimeoutMs?: number
  /**
   * Fed the byte count of each outgoing chunk as the body is sent; raw increments, not a running
   * total. A platform that cannot observe the outgoing body ignores it.
   */
  progressReporter?: (increment: number) => void
  /**
   * Aborts the request. A deadline for the whole call, across every retry, is expressed here too, by a
   * signal that aborts on a timer; there is no separate whole-request timeout.
   */
  signal?: AbortSignalLike
  /**
   * `true` to let send resolve before the response body is read, handing back a lazy body; `false`
   * or absent to read the body into memory before send resolves. `true` is honoured only for 2xx
   * responses other than 203; error and 203 bodies are read into memory regardless. A platform
   * that cannot stream ignores `true`.
   */
  responseStream?: boolean
}

/** Sends a request on the platform's own HTTP stack. */
export interface HttpTransport {
  /** Rejects retryable transport failures with `RequestError`; other errors are not retried. */
  send(request: RequestMessage, options: RequestOptions): Promise<ResponseMessage>
  /** Free-form platform description for the `User-Agent`, such as `linux/-/x64;node20.11.0`. */
  platform?: string
  /** Whether this transport sends request bodies incrementally. Absent counts as false. */
  canStreamUpload?: boolean
}
