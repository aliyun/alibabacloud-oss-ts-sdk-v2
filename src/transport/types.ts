import type { AbortSignalLike } from '../utils/abort.js'
import { OssError } from '../error/types.js'

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

/**
 * A single-pass write cursor over one HTTP attempt's response body: the push-side mirror of `StreamLike`.
 * Chunks arrive in order, one sink serves one attempt, and the caller that made the sink closes it.
 */
export interface ByteSink {
  /** Takes the next run of bytes. The transport waits for a returned promise, so writes never overlap. */
  write(chunk: Uint8Array): void | Promise<void>
  /** Releases whatever the sink holds. Optional, and a no-op once the body is delivered. */
  close?(): void | Promise<void>
}

/**
 * Hands the transport one `ByteSink` per attempt, made from the length and headers the response declared.
 * `oneShot` is the replay marker, the response-side twin of `ByteContent.oneShot`: `true` keeps the
 * retryer from asking for another sink.
 */
export interface ByteSinkFactory {
  /**
   * Opens a sink for one attempt. `size` is the object size the response declared, or `-1` when it declared
   * nothing parseable; `headers` are that response's, lower-cased as the transport reports them.
   */
  supplier(size: number, headers: Record<string, string>): ByteSink
  /** `true` when the request must not be retried once this sink has taken bytes. */
  readonly oneShot: boolean
}

/** Wraps a sink the caller already has, which makes the download one-shot: it cannot be written twice. */
export function toOneShotSinkFactory(sink: ByteSink): ByteSinkFactory {
  return {
    supplier: (): ByteSink => sink,
    oneShot: true,
  }
}

/** Where in a caller's buffer a downloaded body goes. */
export interface MemorySinkOptions {
  /** Where the first byte goes, defaulting to the start of the buffer. */
  offset?: number
}

/** Writes a downloaded body into the rest of a caller's buffer, refusing a chunk that does not fit. */
class MemorySink implements ByteSink {
  /** Bytes written, which is where the next chunk goes. */
  written = 0

  private readonly buffer: Uint8Array
  private readonly start: number
  /** How much room the buffer had when the attempt started. */
  private readonly room: number
  /** The length the response declared, or `-1` when it declared none. */
  private readonly declared: number

  constructor(buffer: Uint8Array, start: number, declared: number) {
    this.buffer = buffer
    this.start = start
    this.room = buffer.byteLength - start
    this.declared = declared
  }

  write(chunk: Uint8Array): void {
    if (chunk.byteLength > this.room - this.written) throw new OssError(this.refused())
    this.buffer.set(chunk, this.start + this.written)
    this.written += chunk.byteLength
  }

  /** Names the room the buffer offered and the length that outgrew it. */
  private refused(): string {
    const declared = this.declared >= 0 ? ', of which it declared ' + String(this.declared) + ' bytes in all' : ''
    return 'the response body does not fit the ' + String(this.room) + ' bytes left in the buffer for it' + declared
  }
}

/**
 * A `ByteSinkFactory` over a buffer the caller owns, so a download is bounded by what was allocated rather
 * than by what the transport holds in memory. Every attempt refills the same range, so `oneShot` is false,
 * and a body longer than the room ends the attempt with `OssError` -- a failure no retry can improve.
 */
export class MemorySinkFactory implements ByteSinkFactory {
  /** Each attempt refills the same range of the caller's buffer. */
  readonly oneShot: boolean = false

  private readonly buffer: Uint8Array
  private readonly start: number
  /** The sink of the attempt that ran last, which is what `written` reports. */
  private last: MemorySink | undefined

  constructor(buffer: Uint8Array, options?: MemorySinkOptions) {
    this.buffer = buffer
    this.start = options?.offset ?? 0
  }

  /** Bytes the last attempt wrote, counting from `offset`. */
  get written(): number {
    return this.last?.written ?? 0
  }

  /** Opens one attempt's sink, refusing a declared length that will not fit before pulling the body. */
  supplier(size: number, _headers: Record<string, string>): ByteSink {
    const room = this.buffer.byteLength - this.start
    if (size > room) {
      throw new OssError('the response declares ' + String(size) + ' bytes, which does not fit the ' + String(room) + ' bytes left in the buffer for it')
    }
    const sink = new MemorySink(this.buffer, this.start, size)
    this.last = sink
    return sink
  }
}

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
  /**
   * Reads the whole body into memory. Repeat calls return the cached result, but a body that was
   * read as a stream cannot be read this way.
   */
  bytes(): Promise<Uint8Array>
  text(): Promise<string>
  /** Opens the body as a single-use stream. A second `stream()` or a later `bytes()` throws. */
  stream(): StreamLike
  /**
   * Releases the underlying resource without draining the body. Idempotent, and a no-op for a body
   * already in memory. Pending and later reads observe end-of-stream or fail.
   */
  cancel(): void | Promise<void>
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
  /**
   * Receives the body as it arrives instead of handing it back buffered, for a body the transport will
   * stream. A transport that cannot fill one reports no `TransportCapabilityType.SINK_FACTORY`, and the
   * client rejects the call rather than buffering it.
   */
  sinkFactory?: ByteSinkFactory
}

/** A platform behaviour the client must account for: either it settles the request before signing, or it makes a capability unavailable. */
export enum TransportCapabilityType {
  /** The transport adds a `Content-Type` to a body-carrying request that has none. */
  FILLS_CONTENT_TYPE = 'fillsContentType',
  /** The transport can hand a response body to a `ByteSink` while it arrives. */
  SINK_FACTORY = 'sinkFactory',
}

/** Sends a request on the platform's own HTTP stack. */
export interface HttpTransport {
  /** Rejects retryable transport failures with `RequestError`; other errors are not retried. */
  send(request: RequestMessage, options: RequestOptions): Promise<ResponseMessage>
  /** Free-form platform description for the `User-Agent`, such as `linux/-/x64;node20.11.0`. */
  platform?: string
  /** Whether this transport sends request bodies incrementally. Absent counts as false. */
  canStreamUpload?: boolean
  /** Names the `TransportCapabilityType` behaviours this platform reports. Other entries are ignored. */
  capabilities?: readonly string[]
}
