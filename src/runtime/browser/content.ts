import type { ByteContent, ByteSource } from '../../transport/types.js'
import { StreamContent, type StreamBodyOptions } from '../../transport/content.js'
import { fromReadableStream } from './stream.js'

/** A replayable `Blob` or `File` body with `length` set to `blob.size`. */
export class BlobContent implements ByteContent {
  readonly length: number
  readonly oneShot = false
  readonly blob: Blob

  constructor(blob: Blob) {
    this.blob = blob
    this.length = blob.size
  }

  source(): ByteSource {
    return fromReadableStream(this.blob.stream())
  }
}

/** Wraps a `Blob` or `File` as a replayable body the browser streams from disk. */
export function blobBody(blob: Blob): BlobContent {
  return new BlobContent(blob)
}

/**
 * Wraps a web `ReadableStream<Uint8Array>` as a one-shot `StreamContent`. Note the default browser
 * transport cannot send a streamed body and will reject one; this factory serves a custom transport
 * or a platform that can. Pass `length` when known.
 */
export function readableStreamBody(stream: ReadableStream<Uint8Array>, options?: StreamBodyOptions): StreamContent {
  return new StreamContent(fromReadableStream(stream), options)
}
