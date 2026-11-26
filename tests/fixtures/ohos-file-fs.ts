import type { HarmonyFileFs } from '../../src/runtime/harmony/file-content.js'

/**
 * Stand-in for the device-only `@ohos.file.fs`: file bytes live in a map, and an `fd` names an open
 * handle with its own file pointer, as on the platform.
 */
const contents = new Map<string, Uint8Array>()
const handles = new Map<number, { path: string; pointer: number }>()
let nextFd = 3
/** When set, a `write` takes only this many of the bytes it was handed. */
let writeCap: number | undefined

/** The bytes a path holds, or `undefined` when it was never created. */
export function fileBytes(path: string): Uint8Array | undefined {
  return contents.get(path)
}

/** The text a path holds, or `undefined` when it was never created. */
export function fileText(path: string): string | undefined {
  const bytes = contents.get(path)
  return bytes === undefined ? undefined : new TextDecoder().decode(bytes)
}

/** Writes stop taking more than this many bytes at a time, which is how a full device refuses one. */
export function capWrites(bytes?: number): void {
  writeCap = bytes
}

/** Handles still open, which is how a test notices a leak. */
export function openHandles(): number {
  return handles.size
}

/** Forgets every file and handle. */
export function resetFiles(): void {
  contents.clear()
  handles.clear()
  nextFd = 3
  writeCap = undefined
}

/** The flags the platform names, in the values it names them at. */
const OpenMode = {
  READ_ONLY: 0o0,
  WRITE_ONLY: 0o1,
  CREATE: 0o100,
  TRUNC: 0o1000,
}

function held(fd: number): { path: string; pointer: number } {
  const handle = handles.get(fd)
  if (handle === undefined) throw new Error('13900002 bad file descriptor: ' + String(fd))
  return handle
}

function stored(path: string): Uint8Array {
  const bytes = contents.get(path)
  if (bytes === undefined) throw missing(path)
  return bytes
}

function missing(path: string): Error {
  const error: Error & { code?: number } = new Error('13900002 no such file or directory: ' + path)
  error.code = 13900002
  return error
}

const fileSystem: HarmonyFileFs = {
  OpenMode,
  open(path: string, mode?: number) {
    const flags = mode ?? OpenMode.READ_ONLY
    // WRITE_ONLY on its own still creates on this platform only with CREATE, and TRUNC empties.
    if ((flags & OpenMode.TRUNC) !== 0) contents.set(path, new Uint8Array(0))
    else if (contents.get(path) === undefined) {
      if ((flags & OpenMode.CREATE) === 0) return Promise.reject(missing(path))
      contents.set(path, new Uint8Array(0))
    }
    const fd = nextFd
    nextFd += 1
    handles.set(fd, { path, pointer: 0 })
    return Promise.resolve({ fd })
  },
  read(fd, buffer, options) {
    const handle = held(fd)
    const source = stored(handle.path)
    const position = options?.offset ?? handle.pointer
    const want = Math.min(options?.length ?? buffer.byteLength, Math.max(0, source.byteLength - position))
    new Uint8Array(buffer).set(source.subarray(position, position + want))
    handle.pointer = position + want
    return Promise.resolve(want)
  },
  write(fd, buffer, options) {
    const handle = held(fd)
    // An `offset` names a position in the file, exactly as `read`'s does; without one, the pointer takes it.
    const position = options?.offset ?? handle.pointer
    // A device short of space reports fewer bytes taken than it was handed, and stores only those.
    const taken = writeCap === undefined ? buffer.byteLength : Math.min(writeCap, buffer.byteLength)
    const source = new Uint8Array(buffer, 0, taken)
    const existing = stored(handle.path)
    const bytes = new Uint8Array(Math.max(existing.byteLength, position + source.byteLength))
    bytes.set(existing)
    bytes.set(source, position)
    contents.set(handle.path, bytes)
    handle.pointer = position + source.byteLength
    return Promise.resolve(source.byteLength)
  },
  close(fd) {
    if (handles.delete(fd)) return Promise.resolve()
    return Promise.reject(new Error('13900002 bad file descriptor: ' + String(fd)))
  },
  stat(path) {
    const bytes = contents.get(path)
    if (bytes === undefined) return Promise.reject(missing(path))
    return Promise.resolve({ size: bytes.byteLength })
  },
}

export default fileSystem
