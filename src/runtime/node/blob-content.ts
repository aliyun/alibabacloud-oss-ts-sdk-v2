import type { ByteContent, ByteSource } from '../../transport/types.js'

/**
 * A replayable `Blob` or `File` body. Each `source()` opens a fresh cursor over `blob.stream()`;
 * `length` is `blob.size`, and the bytes are streamed without being buffered whole.
 */
export class BlobContent implements ByteContent {
  readonly length: number
  readonly oneShot = false
  readonly blob: Blob

  constructor(blob: Blob) {
    this.blob = blob
    this.length = blob.size
  }

  source(): ByteSource {
    const reader = this.blob.stream().getReader()
    let done = false
    return {
      async read(): Promise<Uint8Array | null> {
        for (;;) {
          const next = await reader.read()
          if (next.done) {
            done = true
            return null
          }
          if (next.value.byteLength > 0) return next.value
        }
      },
      // Releases an abandoned blob read.
      async cancel(): Promise<void> {
        if (done) return
        done = true
        await reader.cancel()
      },
    }
  }
}

/** Wraps a `Blob` or `File` as a replayable body node streams from the blob without buffering it whole. */
export function blobBody(blob: Blob): BlobContent {
  return new BlobContent(blob)
}
