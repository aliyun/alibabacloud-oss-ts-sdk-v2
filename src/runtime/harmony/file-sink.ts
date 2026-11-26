import fileIo from '@ohos.file.fs'
import { OssError } from '../../error/types.js'
import type { ByteSink, ByteSinkFactory } from '../../transport/types.js'

/** Where in the file a downloaded body is written. */
export interface FileSinkOptions {
  /**
   * The position the first byte goes to. Only an absent `offset` truncates the file, so a whole download
   * leaves exactly the object behind; a given position -- even `0` -- rewrites from there and leaves the
   * bytes outside its range as they were.
   */
  offset?: number
}

/**
 * Writes a response body to a file through `@ohos.file.fs`, one `write` at a time. The handle opens on the
 * first byte, so a download whose body never arrives leaves the path untouched.
 */
class FileSink implements ByteSink {
  private readonly path: string
  private readonly mode: number
  /** Where the next chunk goes, which every `write` is told: a positioned write leaves the pointer behind. */
  private at: number
  /** The open handle, or `undefined` before the first byte and after `close`. */
  private fd: number | undefined

  constructor(path: string, mode: number, offset: number) {
    this.path = path
    this.mode = mode
    this.at = offset
  }

  async write(chunk: Uint8Array): Promise<void> {
    if (this.fd === undefined) {
      const file = await fileIo.open(this.path, this.mode)
      this.fd = file.fd
    }
    const fd = this.fd
    const at = this.at
    // `write` takes a whole `ArrayBuffer`, and a chunk can be a view onto a larger one.
    const buffer = new ArrayBuffer(chunk.byteLength)
    new Uint8Array(buffer).set(chunk)
    let failure: Error | undefined
    try {
      const written = await fileIo.write(fd, buffer, { offset: at })
      if (written < chunk.byteLength) {
        failure = new OssError('@ohos.file.fs wrote ' + String(written) + ' of ' + String(chunk.byteLength) + ' bytes to ' + this.path)
      } else {
        this.at = at + written
      }
    } catch (error) {
      failure = error instanceof Error ? error : new OssError('@ohos.file.fs threw a value that was not an Error')
    }
    if (failure !== undefined) {
      // Nothing further can reach a file that refused bytes, so give the handle back now.
      await this.close()
      throw failure
    }
  }

  /** Releases the handle, if one is open. Calling it twice is calling it once. */
  async close(): Promise<void> {
    const fd = this.fd
    this.fd = undefined
    if (fd !== undefined) await fileIo.close(fd)
  }
}

/**
 * Hands out one `FileSink` per attempt, each opening `path` afresh, so a replayed attempt takes the same
 * range as the one it replaces. Both open modes are idempotent, which is what keeps `oneShot` false.
 */
export class FileSinkFactory implements ByteSinkFactory {
  /** Every attempt rewrites its own range, truncated from the start or positioned at the caller's offset. */
  readonly oneShot: boolean = false

  private readonly path: string
  private readonly mode: number
  private readonly offset: number

  constructor(path: string, options?: FileSinkOptions) {
    this.path = path
    const given = options?.offset
    this.offset = given ?? 0
    const flags = fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.CREATE
    // A caller who gave no offset owns the whole file, so it truncates: anything else would keep an old tail.
    // One who named a position is replacing a range, and the bytes around it stay as they were.
    this.mode = given === undefined ? flags | fileIo.OpenMode.TRUNC : flags
  }

  supplier(_size: number, _headers: Record<string, string>): ByteSink {
    return new FileSink(this.path, this.mode, this.offset)
  }
}
