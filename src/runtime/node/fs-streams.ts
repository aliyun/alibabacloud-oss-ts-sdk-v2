import { Readable } from 'node:stream'
import type { Client } from '../../client.js'
import { GetObject } from '../../api/object-basic.js'
import type { GetObjectRequest } from '../../models/object-basic.js'
import type { OperationOptions } from '../../types.js'
import type { AbortSignalLike } from '../../utils/abort.js'
import type { ResponseBody } from '../../transport/types.js'
import type { ObjectInfo } from './fs-promises.js'

/** Prefetch tuning for sequential reads. */
export interface PrefetchOptions {
  /** Whether to fetch chunks concurrently ahead of the cursor. Defaults to false. */
  enablePrefetch?: boolean
  /** Maximum number of chunks to fetch concurrently when prefetch is enabled. Defaults to 3. */
  prefetchNum?: number
  /** Sequential bytes to read before enabling prefetch. Defaults to 20 MiB. */
  prefetchThreshold?: number
  /** Out-of-order reads allowed before prefetch is disabled. Defaults to 3. */
  outOfOrderReadThreshold?: number
  /** Chunk size for prefetched Range requests. Defaults to 6 MiB. */
  chunkSize?: number
}

/** Options for `ReadOnlyFileHandle.createReadStream` and `readableWebStream`. */
export interface ReadStreamOptions extends PrefetchOptions {
  /** Byte offset to start reading from. Defaults to 0. */
  start?: number
  /** Byte offset to end reading at (inclusive). Defaults to the last byte. */
  end?: number
  /** Number of bytes to fetch per request. Defaults to 64 KiB. */
  highWaterMark?: number
  /** Close the handle when the stream ends or errors. Defaults to true. */
  autoClose?: boolean
}

/** Fixed object identity needed to issue requests. */
export interface ObjectSource {
  client: Client
  bucket: string
  key: string
  versionId?: string
  requestPayer?: string
}

/** Per-read controls: cancellation signal and request options. */
export interface ObjectReadControls {
  signal?: AbortSignalLike
  operationOptions: (signal?: AbortSignalLike) => OperationOptions
}

/** Fully resolved read parameters for a single stream or range read. */
export interface ObjectReadContext {
  /** Object metadata from `stat()`. */
  info: ObjectInfo
  /** Byte offset to start reading from. */
  start: number
  /** Byte offset to end reading at (inclusive). */
  end: number
  /** Number of bytes to fetch per request. */
  highWaterMark: number
  /** Chunk size for prefetched Range requests. */
  chunkSize: number
  /** Maximum number of chunks to fetch concurrently. */
  prefetchNum: number
  /** Close the handle when the stream ends or errors. */
  autoClose: boolean
}

/** Input shared by the Node and web stream factories. */
export interface ObjectStreamParams {
  source: ObjectSource
  context: ObjectReadContext
  controls: ObjectReadControls
  /** Closes the handle when the stream ends or errors and `autoClose` is set. */
  onAutoClose?: () => Promise<void>
}

const DEFAULT_PREFETCH_NUM = 3
const DEFAULT_PREFETCH_THRESHOLD = 20 * 1024 * 1024
const DEFAULT_OUT_OF_ORDER_READ_THRESHOLD = 3
const DEFAULT_PREFETCH_CHUNK_SIZE = 6 * 1024 * 1024
const DEFAULT_STREAM_CHUNK_SIZE = 64 * 1024

interface ObjectCursorOptions {
  source: ObjectSource
  context: ObjectReadContext
  controls: ObjectReadControls
}

interface PrefetchSlot {
  /** First byte of the object covered by this slot. */
  start: number
  /** Last byte of the object covered by this slot, inclusive. */
  end: number
  /** Pre-allocated destination that the fetch task writes into. */
  buffer: Uint8Array
  /** Resolves once `buffer` is fully written, rejects if the fetch fails. */
  promise: Promise<void>
}

/** Builds a `bytes=start-end` Range header value. */
function formatRange(start: number, end: number): string {
  return `bytes=${start}-${end}`
}

/** Sends a ranged GetObject for the given byte span. */
async function rangeRequest(
  source: ObjectSource,
  controls: ObjectReadControls,
  start: number,
  end: number,
  signal?: AbortSignalLike,
): Promise<{ body: ResponseBody; headers: Record<string, string> }> {
  const request: GetObjectRequest = {
    bucket: source.bucket,
    key: source.key,
    versionId: source.versionId,
    requestPayer: source.requestPayer,
    range: formatRange(start, end),
    rangeBehavior: 'standard',
  }
  const result = await source.client.send(
    new GetObject(request),
    controls.operationOptions(signal),
  )
  if (result.body === undefined) {
    throw new Error('GetObject response body is missing')
  }
  return { body: result.body, headers: result.headers }
}

/** Case-insensitive header lookup. */
function header(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      return value
    }
  }
  return undefined
}

/** Parses a `bytes start-end/size` Content-Range header. */
function parseContentRange(
  value: string,
): { start: number; end: number; size?: number } | undefined {
  const match = value.match(/bytes\s+(\d+)-(\d+)\/(\d+|\*)/)
  if (match === null) {
    return undefined
  }
  return {
    start: parseInt(match[1], 10),
    end: parseInt(match[2], 10),
    size: match[3] === '*' ? undefined : parseInt(match[3], 10),
  }
}

/**
 * Validates that a ranged response still refers to the same object and start position.
 *
 * Compares Content-Range, ETag and Last-Modified against the source snapshot.
 */
function checkObjectSame(
  headers: Record<string, string>,
  info: ObjectInfo,
  expectedStart: number,
): void {
  const contentRange = header(headers, 'content-range')
  if (contentRange !== undefined) {
    const parsed = parseContentRange(contentRange)
    if (parsed !== undefined) {
      if (parsed.start !== expectedStart) {
        throw new Error(
          `Range start mismatch: expected ${expectedStart}, got ${parsed.start}`,
        )
      }
      if (parsed.size !== undefined && parsed.size !== info.size) {
        throw new Error(
          `Object size changed during read: expected ${info.size}, got ${parsed.size}`,
        )
      }
    }
  }

  const etag = header(headers, 'etag')
  if (info.etag !== undefined && etag !== undefined && etag !== info.etag) {
    throw new Error(
      `Object ETag changed during read: expected ${info.etag}, got ${etag}`,
    )
  }

  const lastModified = header(headers, 'last-modified')
  if (
    info.lastModified !== undefined &&
    lastModified !== undefined &&
    new Date(lastModified).getTime() !== info.lastModified.getTime()
  ) {
    throw new Error('Object Last-Modified changed during read')
  }
}

/**
 * Pull cursor that reads an object in fixed-size chunks.
 *
 * A window of up to `prefetchNum` slots is pre-allocated; each in-flight fetch writes
 * directly into its slot. Reads are served from the head slot in `highWaterMark`-sized
 * pieces, and consumed slots are recycled for the next Range request. Each response is
 * checked against the original object metadata to detect concurrent object modifications.
 */
class PrefetchCursor {
  private readonly source: ObjectSource
  private readonly context: ObjectReadContext
  private readonly controls: ObjectReadControls

  private position: number
  private issuePosition: number
  private window: PrefetchSlot[] = []
  private controller: AbortController
  private cancelled = false

  constructor(options: ObjectCursorOptions) {
    this.source = options.source
    this.context = options.context
    this.controls = options.controls
    this.position = options.context.start
    this.issuePosition = options.context.start
    this.controller = new AbortController()
  }

  bindController(controller: AbortController): void {
    this.controller = controller
  }

  async read(): Promise<Uint8Array | null> {
    if (this.cancelled || this.position > this.context.end) {
      return null
    }
    this._ensureWindow()
    if (this.window.length === 0) {
      return null
    }
    const slot = this.window[0]
    try {
      await slot.promise
    } catch (error) {
      if (this.cancelled) {
        return null
      }
      this.cancel()
      if (error instanceof Error) {
        throw error
      }
      const wrapped = new Error('Prefetch chunk failed')
      Object.defineProperty(wrapped, 'cause', { value: error })
      throw wrapped
    }
    const available = slot.end + 1 - this.position
    const size = Math.min(Math.max(1, this.context.highWaterMark), available)
    const chunk = new Uint8Array(size)
    chunk.set(slot.buffer.subarray(this.position - slot.start, this.position - slot.start + size))
    this.position += size
    if (this.position > slot.end) {
      this.window.shift()
      this._ensureWindow()
    }
    return chunk
  }

  cancel(): void {
    if (this.cancelled) {
      return
    }
    this.cancelled = true
    this.position = this.context.end + 1
    this.window = []
    this.controller.abort()
  }

  private _ensureWindow(): void {
    while (
      !this.cancelled &&
      this.window.length < this.context.prefetchNum &&
      this.issuePosition <= this.context.end
    ) {
      const start = this.issuePosition
      const end = Math.min(start + this.context.chunkSize - 1, this.context.end)
      const slot: PrefetchSlot = {
        start,
        end,
        buffer: new Uint8Array(end - start + 1),
        promise: Promise.resolve(),
      }
      slot.promise = this._fillSlot(slot)
      // Failures surface when the slot reaches the head of the window; mark them handled
      // so slots fetched ahead of the consumer do not raise unhandled rejections.
      slot.promise.catch(() => {})
      this.window.push(slot)
      this.issuePosition = end + 1
    }
  }

  private async _fillSlot(slot: PrefetchSlot): Promise<void> {
    let written = 0
    const expectedLength = slot.end - slot.start + 1
    // Body read failures are retried from the last written byte; a failed request is not.
    while (true) {
      const start = slot.start + written
      const { body, headers } = await rangeRequest(
        this.source,
        this.controls,
        start,
        slot.end,
        this.controller.signal,
      )
      checkObjectSame(headers, this.context.info, start)

      const reader = body.stream()
      try {
        while (written < slot.buffer.byteLength) {
          const piece = await reader.read()
          if (piece === null || piece.byteLength === 0) {
            break
          }
          const take = Math.min(piece.byteLength, slot.buffer.byteLength - written)
          slot.buffer.set(piece.subarray(0, take), written)
          written += take
        }
      } catch (error) {
        try {
          await reader.cancel?.()
        } catch {
          // ignore cleanup errors
        }
        try {
          await body.cancel()
        } catch {
          // ignore cleanup errors
        }
        if (this.cancelled || isTerminalStreamError(error)) {
          throw error
        }
        continue
      }
      break
    }
    if (actualLengthTooShort(written, expectedLength, slot.start, this.context.end)) {
      throw new Error(
        `Short Range response: expected ${expectedLength} bytes at ${slot.start}, got ${written}`,
      )
    }
  }
}

/**
 * Single-request cursor that passes the GetObject response body through directly.
 *
 * If reading from the response body fails, the cursor reopens a Range request at the
 * last consumed byte and retries indefinitely. Only failures from the underlying
 * GetObject request itself cause the cursor to give up.
 */
export class PassthroughCursor {
  private readonly source: ObjectSource
  private readonly context: ObjectReadContext
  private readonly controls: ObjectReadControls

  private position: number
  private controller: AbortController
  private cancelled = false
  private currentBody?: ResponseBody
  private currentReader?: { read(): Promise<Uint8Array | null>; cancel?(): void | Promise<void> }

  constructor(options: ObjectCursorOptions) {
    this.source = options.source
    this.context = options.context
    this.controls = options.controls
    this.position = options.context.start
    this.controller = new AbortController()
  }

  bindController(controller: AbortController): void {
    this.controller = controller
  }

  async read(): Promise<Uint8Array | null> {
    if (this.cancelled || this.position > this.context.end) {
      return null
    }

    while (true) {
      if (this.currentReader === undefined) {
        // Errors from opening the request (including metadata mismatch) propagate out.
        await this._open(this.position)
      }

      try {
        const chunk = await this.currentReader!.read()
        if (chunk === null || chunk.byteLength === 0) {
          this.position = this.context.end + 1
          return null
        }
        this.position += chunk.byteLength
        return chunk
      } catch (error) {
        if (this.cancelled) {
          return null
        }
        if (isTerminalStreamError(error)) {
          throw error
        }
        await this._closeCurrent()
        // Reopen from the last successfully consumed byte.
      }
    }
  }

  cancel(): void {
    if (this.cancelled) {
      return
    }
    this.cancelled = true
    this.position = this.context.end + 1
    this.controller.abort()
    this._closeCurrentSync()
  }

  private async _open(position: number): Promise<void> {
    const { body, headers } = await rangeRequest(
      this.source,
      this.controls,
      position,
      this.context.end,
      this.controller.signal,
    )
    checkObjectSame(headers, this.context.info, position)
    this.currentBody = body
    this.currentReader = body.stream()
  }

  private async _closeCurrent(): Promise<void> {
    if (this.currentReader?.cancel !== undefined) {
      try {
        await this.currentReader.cancel()
      } catch {
        // ignore cleanup errors
      }
    }
    if (this.currentBody !== undefined) {
      try {
        await this.currentBody.cancel()
      } catch {
        // ignore cleanup errors
      }
    }
    this.currentReader = undefined
    this.currentBody = undefined
  }

  private _closeCurrentSync(): void {
    try {
      void this.currentReader?.cancel?.()
    } catch {
      // ignore cleanup errors
    }
    try {
      void this.currentBody?.cancel()
    } catch {
      // ignore cleanup errors
    }
    this.currentReader = undefined
    this.currentBody = undefined
  }
}

/** Whether a stream read error is terminal rather than recoverable by reconnecting. */
function isTerminalStreamError(error: unknown): boolean {
  if (error === undefined || error === null) {
    return false
  }
  if (typeof error === 'object') {
    const name = (error as { name?: string }).name
    if (name === 'AbortError' || name === 'StreamConsumedError') {
      return true
    }
  }
  return false
}

function actualLengthTooShort(
  actualLength: number,
  expectedLength: number,
  position: number,
  end: number,
): boolean {
  return actualLength < expectedLength && position + actualLength <= end
}

/**
 * Returns a Node.js `Readable` over the object.
 *
 * Without prefetch the underlying GetObject response body is passed through and will
 * reconnect on a dropped connection. With prefetch, up to `prefetchNum` fixed-size
 * chunks are fetched concurrently into pre-allocated slots and delivered in
 * `highWaterMark`-sized pieces.
 */
export function createNodeReadStream(params: ObjectStreamParams): Readable {
  const cursor = createCursor(params.source, params.context, params.controls)
  const controller = bindSignal(params.controls)
  cursor.bindController(controller)

  const stream = Readable.from(
    passthroughChunks(cursor, params.context.autoClose, params.onAutoClose),
    {
      highWaterMark: params.context.highWaterMark,
      objectMode: false,
    },
  )
  stream.on('close', () => controller.abort())
  return stream
}

/**
 * Returns a WHATWG `ReadableStream<Uint8Array>` over the object.
 *
 * Without prefetch the underlying GetObject response body is passed through and will
 * reconnect on a dropped connection. With prefetch, up to `prefetchNum` fixed-size
 * chunks are fetched concurrently into pre-allocated slots and delivered in
 * `highWaterMark`-sized pieces.
 */
export function createWebReadStream(
  params: ObjectStreamParams,
): ReadableStream<Uint8Array> {
  const cursor = createCursor(params.source, params.context, params.controls)
  const controller = bindSignal(params.controls)
  cursor.bindController(controller)

  return new ReadableStream<Uint8Array>(
    {
      pull: async (stream): Promise<void> => {
        const chunk = await cursor.read()
        if (chunk === null || chunk.byteLength === 0) {
          stream.close()
          if (params.context.autoClose) await params.onAutoClose?.().catch(() => {})
          return
        }
        stream.enqueue(chunk)
      },
      cancel: (): void | Promise<void> => {
        cursor.cancel()
        if (params.context.autoClose) {
          return params.onAutoClose?.().catch(() => {})
        }
      },
    },
    { highWaterMark: params.context.highWaterMark },
  )
}

/**
 * Resolves user options and handle defaults into a concrete read context.
 *
 * The returned context contains the object info, byte range, prefetch settings,
 * and stream configuration needed to start a download.
 */
export function planObjectReadContext(
  info: ObjectInfo,
  defaults: PrefetchOptions,
  options?: ReadStreamOptions,
): ObjectReadContext {
  const size = info.size
  const start = Math.max(0, options?.start ?? 0)
  const end = options?.end !== undefined ? Math.min(options.end, size - 1) : size - 1
  const highWaterMark = options?.highWaterMark ?? DEFAULT_STREAM_CHUNK_SIZE
  const prefetch = resolvePrefetchOptions(defaults, options)
  return {
    info,
    start,
    end: Math.max(start - 1, end),
    highWaterMark,
    chunkSize: prefetch.chunkSize,
    prefetchNum: prefetch.enablePrefetch ? prefetch.prefetchNum : 1,
    autoClose: options?.autoClose ?? true,
  }
}

function resolvePrefetchOptions(
  defaults?: PrefetchOptions,
  overrides?: PrefetchOptions,
): Required<PrefetchOptions> {
  return {
    enablePrefetch: overrides?.enablePrefetch ?? defaults?.enablePrefetch ?? false,
    prefetchNum: overrides?.prefetchNum ?? defaults?.prefetchNum ?? DEFAULT_PREFETCH_NUM,
    prefetchThreshold: overrides?.prefetchThreshold ?? defaults?.prefetchThreshold ?? DEFAULT_PREFETCH_THRESHOLD,
    outOfOrderReadThreshold:
      overrides?.outOfOrderReadThreshold ??
      defaults?.outOfOrderReadThreshold ??
      DEFAULT_OUT_OF_ORDER_READ_THRESHOLD,
    chunkSize: overrides?.chunkSize ?? defaults?.chunkSize ?? DEFAULT_PREFETCH_CHUNK_SIZE,
  }
}

/** Cursor shared by the two stream implementations. */
type ObjectReadCursor = PrefetchCursor | PassthroughCursor

function createCursor(
  source: ObjectSource,
  context: ObjectReadContext,
  controls: ObjectReadControls,
): ObjectReadCursor {
  if (context.prefetchNum > 1) {
    return new PrefetchCursor({ source, context, controls })
  }
  return new PassthroughCursor({ source, context, controls })
}

/** Aborts the cursor when the caller's signal fires. */
export function bindSignal(controls: ObjectReadControls): AbortController {
  const controller = new AbortController()
  const signal = controls.signal
  if (signal?.aborted) {
    controller.abort()
  } else if (signal) {
    signal.addEventListener('abort', () => controller.abort())
  }
  return controller
}

async function* passthroughChunks(
  cursor: ObjectReadCursor,
  autoClose: boolean,
  onAutoClose?: () => Promise<void>,
): AsyncGenerator<Uint8Array> {
  try {
    while (true) {
      const chunk = await cursor.read()
      if (chunk === null) break
      yield chunk
    }
  } finally {
    cursor.cancel()
    if (autoClose) await onAutoClose?.().catch(() => {})
  }
}
