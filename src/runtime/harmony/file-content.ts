import fileIo from '@ohos.file.fs'
import type { ByteContent, ByteSource } from '../../transport/types.js'

/** A `@ohos.file.fs` file handle; only its descriptor is read here. */
export interface HarmonyFile {
  fd: number
}

/** As much of a `@ohos.file.fs` `Stat` as this package reads. */
export interface HarmonyStat {
  size: number
}

/** The `@ohos.file.fs` `OpenMode` members this package names: read a file, and create or overwrite one. */
export interface HarmonyOpenMode {
  readonly READ_ONLY: number
  readonly WRITE_ONLY: number
  readonly CREATE: number
  readonly TRUNC: number
}

/** The positional `read` options this package passes: a file `offset` and a byte `length`. */
export interface HarmonyReadOptions {
  offset?: number
  length?: number
}

/** The one `write` option this package passes: a position in the file, as `read` takes. */
export interface HarmonyWriteOptions {
  offset?: number
}

/**
 * The subset of `@ohos.file.fs` this package uses, which is also what `types/ohos-file-fs.d.ts` declares the
 * module to be. Every member is a named interface because `src/runtime/harmony` is compiled as ArkTS, which
 * has no object literal types. `read`'s `offset` is a position in the file, not in the buffer; `write` takes
 * an `ArrayBuffer` whole, not a view onto a larger one, and a write given an `offset` leaves the file pointer
 * where it was.
 */
export interface HarmonyFileFs {
  open(path: string, mode?: number): Promise<HarmonyFile>
  read(fd: number, buffer: ArrayBuffer, options?: HarmonyReadOptions): Promise<number>
  write(fd: number, buffer: ArrayBuffer, options?: HarmonyWriteOptions): Promise<number>
  close(fd: number): Promise<void>
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
    let fd: number | undefined

    const closeIfOpen = async (): Promise<void> => {
      if (fd !== undefined) {
        const handle = fd
        fd = undefined
        await fileIo.close(handle)
      }
    }

    return {
      async read(): Promise<Uint8Array | null> {
        if (pos >= end) {
          await closeIfOpen()
          return null
        }
        if (fd === undefined) fd = (await fileIo.open(path, fileIo.OpenMode.READ_ONLY)).fd
        const handle = fd
        const want = Math.min(CHUNK_BYTES, end - pos)
        const buffer = new ArrayBuffer(want)
        const read = await fileIo.read(handle, buffer, { offset: pos, length: want })
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
