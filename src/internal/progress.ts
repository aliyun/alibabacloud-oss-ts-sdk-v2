import type { ByteContent, HeaderFields } from '../transport/types.js'
import type { ProgressHandler } from '../types.js'

/** Wraps a caller's `ProgressHandler` and tracks the uploaded high-water mark across retries. */
export class ProgressObserver {
  private written = 0
  private lastWritten = 0
  private readonly inner: ProgressHandler
  private readonly total: number

  constructor(inner: ProgressHandler, total: number) {
    this.inner = inner
    this.total = total
  }

  /** Fires `increment` verbatim, even where it straddles the high-water mark. */
  readonly feed = (increment: number): void => {
    this.written += increment
    if (this.written > this.lastWritten) this.inner(increment, this.written, this.total)
  }

  readonly reset = (): void => {
    this.lastWritten = this.written
    this.written = 0
  }
}

/**
 * The upload total, or `-1` when it cannot be known up front. A declared `Content-Length` wins, then
 * the body's own `length`; an unknown-length stream remains `-1`.
 */
export function resolveUploadTotal(body: ByteContent | undefined, headers: HeaderFields): number {
  const declared = headers.get('content-length')
  if (declared !== undefined && declared !== '') {
    const n = Number(declared)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return body?.length ?? -1
}
