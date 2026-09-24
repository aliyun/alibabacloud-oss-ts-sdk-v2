import type { ByteContent, ByteSource, RequestBody } from './types.js'
import { utf8Encode } from '../utils/bytes.js'

/** Options shared by every one-shot stream body. `length` is the declared byte count. */
export interface StreamBodyOptions {
  length?: number
}

/** A cursor that yields one materialized chunk and then reports end-of-stream. */
function singleChunkSource(chunk: Uint8Array): ByteSource {
  let sent = false
  return {
    read(): Promise<Uint8Array | null> {
      if (sent) return Promise.resolve(null)
      sent = true
      // A zero-length payload returns `null`.
      return Promise.resolve(chunk.byteLength > 0 ? chunk : null)
    },
  }
}

/** A `Uint8Array` body. Replayable: every cursor re-reads the same bytes. */
export class BytesContent implements ByteContent {
  readonly length: number
  readonly oneShot = false
  /** The whole payload, materialized. */
  readonly bytes: Uint8Array

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
    this.length = bytes.byteLength
  }

  source(): ByteSource {
    return singleChunkSource(this.bytes)
  }
}

/** A `string` body, measured and emitted as UTF-8. Replayable. */
export class StringContent implements ByteContent {
  readonly length: number
  readonly oneShot = false
  /** The UTF-8 encoding of the string, materialized once at construction. */
  readonly bytes: Uint8Array

  constructor(text: string) {
    this.bytes = utf8Encode(text)
    this.length = this.bytes.byteLength
  }

  source(): ByteSource {
    return singleChunkSource(this.bytes)
  }
}

/**
 * A one-shot stream body. `source()` hands back the single underlying cursor, so it can be read only
 * once; `oneShot` is therefore always `true` and a failed attempt cannot be retried. `length` is
 * whatever the caller declared, or `undefined` for chunked transfer.
 */
export class StreamContent implements ByteContent {
  readonly length: number | undefined
  readonly oneShot = true
  private readonly cursor: ByteSource

  constructor(source: ByteSource, options?: StreamBodyOptions) {
    this.cursor = source
    this.length = options?.length
  }

  source(): ByteSource {
    return this.cursor
  }
}

/** Wraps a `Uint8Array` as a replayable body. */
export function bytesBody(bytes: Uint8Array): BytesContent {
  return new BytesContent(bytes)
}

/** Wraps a `string` as a replayable UTF-8 body. */
export function stringBody(text: string): StringContent {
  return new StringContent(text)
}

/** Wraps an already-normalized `ByteSource` as a one-shot body. */
export function streamBody(source: ByteSource, options?: StreamBodyOptions): StreamContent {
  return new StreamContent(source, options)
}

/** Normalizes a `RequestBody` to `ByteContent`; existing `ByteContent` passes through unchanged. */
export function toByteContent(body: RequestBody | undefined): ByteContent | undefined {
  if (body === undefined) return undefined
  if (typeof body === 'string') return new StringContent(body)
  if (body instanceof Uint8Array) return new BytesContent(body)
  return body
}
