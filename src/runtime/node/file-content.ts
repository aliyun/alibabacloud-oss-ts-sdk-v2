import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { ByteContent, ByteSource } from '../../transport/types.js'
import { StreamContent, type StreamBodyOptions } from '../../transport/content.js'
import { fromReadable } from './stream.js'

/**
 * A file-backed, replayable body. Each `source()` opens a fresh `fs.createReadStream` over the byte
 * range `[offset, offset + length)`. Use `fileBody` to stat the file and fill in the range.
 */
export class FileContent implements ByteContent {
  readonly oneShot = false
  readonly path: string
  readonly offset: number
  readonly length: number

  constructor(path: string, offset: number, length: number) {
    this.path = path
    this.offset = offset
    this.length = length
  }

  source(): ByteSource {
    // `end` is inclusive in `createReadStream`, hence the `- 1`. A zero-length range reads nothing.
    if (this.length === 0) return { read: (): Promise<Uint8Array | null> => Promise.resolve(null) }
    return fromReadable(createReadStream(this.path, { start: this.offset, end: this.offset + this.length - 1 }))
  }
}

/**
 * Builds a `FileContent`, stat-ing the file to learn the length when one is not given. `offset`
 * defaults to the start, and `length` defaults to the rest of the file.
 */
export async function fileBody(path: string, options?: { offset?: number; length?: number }): Promise<FileContent> {
  const offset = options?.offset ?? 0
  let length = options?.length
  if (length === undefined) {
    const size = (await stat(path)).size
    length = Math.max(0, size - offset)
  }
  return new FileContent(path, offset, length)
}

/**
 * Wraps a `node:stream.Readable` (or any `AsyncIterable<Uint8Array>`) as a one-shot `StreamContent`,
 * adapting it to the pull-based cursor. Pass `length` when it is known so the core can declare a
 * `Content-Length`; without it the body is sent with chunked transfer encoding.
 */
export function readableBody(readable: AsyncIterable<Uint8Array>, options?: StreamBodyOptions): StreamContent {
  return new StreamContent(fromReadable(readable), options)
}
