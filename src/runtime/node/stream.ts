import type { StreamLike } from '../../transport/types.js'

/** Adapts an async iterable of byte chunks to a pull-based `StreamLike`. */
export function fromReadable(readable: AsyncIterable<Uint8Array>): StreamLike {
  const iterator = readable[Symbol.asyncIterator]()
  let exhausted = false

  return {
    async read(): Promise<Uint8Array | null> {
      if (exhausted) return null
      for (;;) {
        const next = await iterator.next()
        if (next.done === true) {
          exhausted = true
          return null
        }
        // Zero-length chunks are skipped.
        if (next.value.byteLength > 0) return next.value
      }
    },
    // Cancels the iterator unless it is already exhausted or cancelled.
    async cancel(): Promise<void> {
      if (exhausted) return
      exhausted = true
      await iterator.return?.()
    },
  }
}
