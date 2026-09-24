import fileIo from '@ohos.file.fs'
import type { ByteContent, ByteSource } from '../../transport/types.js'

/** A `@ohos.file.fs` file handle; only its descriptor is read here. */
export interface HarmonyFile {
  fd: number
}

/** As much of a `@ohos.file.fs` `Stat` as `fileBody` reads. */
export interface HarmonyStat {
  size: number
}

/** The one `@ohos.file.fs` `OpenMode` member this module names. */
export interface HarmonyOpenMode {
  readonly READ_ONLY: number
}

/** The positional `read` options this module passes: a file `offset` and a byte `length`. */
export interface HarmonyReadOptions {
  offset?: number
  length?: number
}

/**
 * The subset of `@ohos.file.fs` this module uses. `read`'s `offset` is a position in the file,
 * not in the buffer.
 */
export interface HarmonyFileFs {
  open(path: string, mode?: number): Promise<HarmonyFile>
  read(fd: number, buffer: ArrayBuffer, options?: HarmonyReadOptions): Promise<number>
  close(file: number | HarmonyFile): Promise<void>
  stat(path: string): Promise<HarmonyStat>
  OpenMode: HarmonyOpenMode
}

const CHUNK_BYTES = 64 * 1024

/**
 * A file-backed, replayable body for OpenHarmony. Each `source()` opens a fresh `@ohos.file.fs` handle
 * over the byte range `[offset, offset + length)` and walks it in `CHUNK_BYTES` reads. A cursor read to
 * `null` closes its handle; one abandoned earlier is closed by `cancel`.
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
    const path = this.path
    const end = this.offset + this.length
    let pos = this.offset
    let file: HarmonyFile | undefined

    const closeIfOpen = async (): Promise<void> => {
      if (file !== undefined) {
        const handle = file
        file = undefined
        await fileIo.close(handle)
      }
    }

    return {
      async read(): Promise<Uint8Array | null> {
        if (pos >= end) {
          await closeIfOpen()
          return null
        }
        if (file === undefined) file = await fileIo.open(path, fileIo.OpenMode.READ_ONLY)
        const want = Math.min(CHUNK_BYTES, end - pos)
        const buffer = new ArrayBuffer(want)
        const read = await fileIo.read(file.fd, buffer, { offset: pos, length: want })
        if (read <= 0) {
          // Stop when the file ends before the declared range.
          await closeIfOpen()
          return null
        }
        pos += read
        return new Uint8Array(buffer, 0, read)
      },
      // Closes the handle when a drain is abandoned mid-file.
      async cancel(): Promise<void> {
        await closeIfOpen()
      },
    }
  }
}

/** Which byte range of a file to send: `offset` defaults to the start, `length` to the rest. */
export interface FileBodyOptions {
  offset?: number
  length?: number
}

/**
 * Builds a `FileContent`, stat-ing the file to learn the length when one is not given. `offset`
 * defaults to the start, `length` to the rest of the file from `offset`.
 */
export async function fileBody(path: string, options?: FileBodyOptions): Promise<FileContent> {
  const offset = options?.offset ?? 0
  let length = options?.length
  if (length === undefined) {
    const size = (await fileIo.stat(path)).size
    length = Math.max(0, size - offset)
  }
  return new FileContent(path, offset, length)
}
