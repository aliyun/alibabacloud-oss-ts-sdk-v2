import type { Readable } from 'node:stream'
import type { Client } from '../../client.js'
import { GetObjectMeta, HeadObject } from '../../api/object-basic.js'
import type { GetObjectMetaRequest, HeadObjectRequest, ObjectMeta } from '../../models/object-basic.js'
import type { OperationOptions } from '../../types.js'
import type { AbortSignalLike } from '../../utils/abort.js'
import {
  bindSignal,
  createNodeReadStream,
  createWebReadStream,
  PassthroughCursor,
  planObjectReadContext,
  type ObjectSource,
  type ObjectReadControls,
  type PrefetchOptions,
  type ReadStreamOptions,
} from './fs-streams.js'

/** Information about an OSS object exposed through a file handle. */
export interface ObjectInfo {
  /** A synthetic path of the form `oss://bucket/key`, with `?versionId=` when one was requested. */
  name: string
  /** Object size in bytes. */
  size: number
  /** The MIME type reported by OSS, if any. */
  contentType?: string
  /** The object last modification time. */
  lastModified?: Date
  /** The entity tag of the object. */
  etag?: string
  /** The version ID, if the bucket has versioning enabled. */
  versionId?: string
  /** The raw response headers from the HEAD request. */
  headers: Record<string, string>
}

/** Options for opening a read-only handle on an OSS object. */
export interface OpenOptions extends PrefetchOptions {
  /** Byte offset to start reading from. Defaults to 0. */
  offset?: number
  /** Version ID of the object to read. */
  versionId?: string
  /** Request payer for requester-pays buckets. */
  requestPayer?: string
  /** Transport options that apply to every request the handle makes. */
  operation?: OperationOptions
}

/** Options object form for {@link ReadOnlyFileHandle.read}. */
export interface ReadOptions {
  /** Buffer that receives the bytes. */
  buffer: Uint8Array
  /** Offset within `buffer` to start writing at. Defaults to 0. */
  offset?: number
  /** Number of bytes to read. Defaults to `buffer.byteLength - offset`. */
  length?: number
  /** Position in the object to read from. `null` or omitted reads from the current cursor. */
  position?: number | null
}

/** Error thrown when a handle is used after it has been closed. */
export class HandleClosedError extends Error {
  constructor(handle: string, operation: string) {
    super(`${handle} is closed, operation: ${operation}`)
    this.name = 'HandleClosedError'
  }
}

/** Error thrown when a read position is outside the valid range. */
export class PositionError extends RangeError {
  constructor(message: string) {
    super(message)
    this.name = 'PositionError'
  }
}

/**
 * Shared identity and lifecycle for object-backed file handles.
 *
 * The base owns the client, the closed state and the synthetic `name`; each subclass owns the
 * object identity, the options its access mode needs, and how it fetches metadata.
 */
export abstract class ObjectFileHandle {
  protected readonly client: Client
  private _closed = false

  protected constructor(client: Client) {
    this.client = client
  }

  /** A synthetic path of the form `oss://bucket/key`, with `?versionId=` when one was requested. */
  abstract get name(): string

  /** Whether {@link close} has been called. */
  get closed(): boolean {
    return this._closed
  }

  /** Closes the handle. Further operations throw {@link HandleClosedError}. */
  close(): Promise<void> {
    this._closed = true
    return Promise.resolve()
  }

  protected _checkValid(operation: string): void {
    if (this._closed) {
      throw new HandleClosedError(this.constructor.name, operation)
    }
  }

  protected _toObjectInfo(meta: ObjectMeta & { headers: Record<string, string> }): ObjectInfo {
    return {
      name: this.name,
      size: meta.contentLength ?? 0,
      contentType: meta.contentType,
      lastModified: meta.lastModified,
      etag: meta.etag,
      versionId: meta.versionId,
      headers: meta.headers,
    }
  }
}

/**
 * A read-only handle for an OSS object, shaped after `fs.promises.FileHandle`.
 *
 * The handle maintains an internal cursor. Calling `read` without a `position`
 * reads from the cursor and advances it by `bytesRead`; passing a `position`
 * reads from that byte offset without moving the cursor.
 */
export class ReadOnlyFileHandle extends ObjectFileHandle {
  private readonly options: OpenOptions
  private readonly _source: ObjectSource

  private _position: number
  private _info?: ObjectInfo

  constructor(client: Client, bucket: string, key: string, options?: OpenOptions) {
    super(client)
    this.options = options ?? {}
    this._source = {
      client: this.client,
      bucket,
      key,
      versionId: this.options.versionId,
      requestPayer: this.options.requestPayer,
    }
    this._position = Math.max(0, this.options.offset ?? 0)
  }

  get name(): string {
    const path = `oss://${this._source.bucket}/${this._source.key}`
    return this._source.versionId === undefined ? path : `${path}?versionId=${this._source.versionId}`
  }

  /** Returns metadata for the object without reading its contents. */
  async stat(): Promise<ObjectInfo> {
    this._checkValid('stat')
    if (this._info !== undefined) {
      return this._info
    }

    const headRequest: HeadObjectRequest = {
      bucket: this._source.bucket,
      key: this._source.key,
      versionId: this._source.versionId,
      requestPayer: this._source.requestPayer,
      headers: { 'accept-encoding': 'identity' },
    }
    const headResult = await this.client.send(
      new HeadObject(headRequest),
      this._operationOptions(),
    )

    let size = headResult.contentLength
    if (size === undefined) {
      const metaRequest: GetObjectMetaRequest = {
        bucket: this._source.bucket,
        key: this._source.key,
        versionId: this._source.versionId,
        requestPayer: this._source.requestPayer,
      }
      const metaResult = await this.client.send(
        new GetObjectMeta(metaRequest),
        this._operationOptions(),
      )
      size = metaResult.contentLength
    }

    this._info = {
      ...this._toObjectInfo(headResult),
      size: size ?? 0,
    }
    return this._info
  }

  /**
   * Reads bytes from the object into `buffer`.
   *
   * Position form: `read(buffer, offset, length, position)`.
   * Options form: `read({ buffer, offset, length, position })`.
   *
   * When `position` is omitted or `null`, data is read from the internal cursor
   * and the cursor advances by `bytesRead`. When `position` is a number, data is
   * read from that offset and the cursor is unchanged.
   */
  async read(
    buffer: Uint8Array,
    offset?: number,
    length?: number,
    position?: number | null,
  ): Promise<{ bytesRead: number; buffer: Uint8Array }>
  async read(options: ReadOptions): Promise<{ bytesRead: number; buffer: Uint8Array }>
  async read(
    bufferOrOptions: Uint8Array | ReadOptions,
    offset?: number,
    length?: number,
    position?: number | null,
  ): Promise<{ bytesRead: number; buffer: Uint8Array }> {
    this._checkValid('read')

    let buffer: Uint8Array
    if (bufferOrOptions instanceof Uint8Array) {
      buffer = bufferOrOptions
      offset ??= 0
      length ??= buffer.byteLength - offset
    } else {
      buffer = bufferOrOptions.buffer
      offset = bufferOrOptions.offset ?? 0
      length = bufferOrOptions.length ?? buffer.byteLength - offset
      position = bufferOrOptions.position
    }

    if (offset < 0 || length < 0 || offset + length > buffer.byteLength) {
      throw new PositionError('Invalid offset or length for read')
    }

    const info = await this.stat()
    if (this._position > info.size) {
      this._position = info.size
    }

    const filePosition = position ?? this._position
    if (filePosition < 0 || filePosition > info.size) {
      throw new PositionError(`Position out of range: ${filePosition}, size: ${info.size}`)
    }

    if (filePosition === info.size) {
      return { bytesRead: 0, buffer }
    }

    const remaining = info.size - filePosition
    const wantLength = Math.min(length, remaining)
    const bytesRead = await this._readRange(filePosition, wantLength, buffer, offset)

    if (position === undefined || position === null) {
      this._position = filePosition + bytesRead
    }

    return { bytesRead, buffer }
  }

  /**
   * Returns a Node.js `Readable` stream over the object.
   *
   * Reads are issued in `highWaterMark`-byte chunks. When `enablePrefetch` is
   * set, up to `prefetchNum` chunks are fetched concurrently ahead of the
   * consumer.
   */
  async createReadStream(options?: ReadStreamOptions): Promise<Readable> {
    this._checkValid('createReadStream')
    await this.stat()
    return createNodeReadStream({
      source: this._source,
      context: planObjectReadContext(this._info!, this.options, options),
      controls: this._controls,
      onAutoClose: () => this.close(),
    })
  }

  /**
   * Returns a WHATWG `ReadableStream<Uint8Array>` over the object.
   *
   * Reads are issued in `highWaterMark`-byte chunks. When `enablePrefetch` is
   * set, up to `prefetchNum` chunks are fetched concurrently ahead of the
   * consumer.
   */
  async readableWebStream(options?: ReadStreamOptions): Promise<ReadableStream<Uint8Array>> {
    this._checkValid('readableWebStream')
    await this.stat()
    return createWebReadStream({
      source: this._source,
      context: planObjectReadContext(this._info!, this.options, options),
      controls: this._controls,
      onAutoClose: () => this.close(),
    })
  }

  private get _controls(): ObjectReadControls {
    return {
      signal: this.options.operation?.signal,
      operationOptions: (signal) => this._operationOptions(signal),
    }
  }

  /** Fetches `length` bytes at `position` and writes them into `buffer` starting at `offset`. */
  private async _readRange(
    position: number,
    length: number,
    buffer: Uint8Array,
    offset: number,
  ): Promise<number> {
    if (length === 0) return 0

    await this.stat()
    const cursor = new PassthroughCursor({
      source: this._source,
      context: {
        info: this._info!,
        start: position,
        end: position + length - 1,
        highWaterMark: 0,
        chunkSize: 0,
        prefetchNum: 1,
        autoClose: false,
      },
      controls: this._controls,
    })
    const controller = bindSignal(this._controls)
    cursor.bindController(controller)

    let written = 0
    try {
      while (written < length) {
        const chunk = await cursor.read()
        if (chunk === null) break
        if (chunk.byteLength === 0) continue
        const take = Math.min(chunk.byteLength, length - written)
        buffer.set(chunk.subarray(0, take), offset + written)
        written += take
        if (take < chunk.byteLength) break
      }
    } finally {
      cursor.cancel()
    }
    return written
  }

  private _operationOptions(signal?: AbortSignalLike): OperationOptions {
    const operation = this.options.operation
    return {
      retryMaxAttempts: operation?.retryMaxAttempts,
      readWriteTimeoutMs: operation?.readWriteTimeoutMs,
      signal: signal ?? operation?.signal,
    }
  }
}
