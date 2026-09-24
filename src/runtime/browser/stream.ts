import type { StreamLike } from '../../transport/types.js'

/**
 * Adapts a web `ReadableStream<Uint8Array>` to the pull-based `StreamLike` the rest of the SDK
 * consumes. A `null` stream -- which `Response.body` can be -- becomes an immediately-exhausted
 * cursor. Zero-length chunks are skipped, since `null` is the only end-of-stream signal.
 */
export function fromReadableStream(stream: ReadableStream<Uint8Array> | null): StreamLike {
  if (stream === null) return { read: (): Promise<Uint8Array | null> => Promise.resolve(null) }
  const reader = stream.getReader()
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
    // Cancels the reader unless it is already exhausted or cancelled.
    async cancel(): Promise<void> {
      if (done) return
      done = true
      await reader.cancel()
    },
  }
}
