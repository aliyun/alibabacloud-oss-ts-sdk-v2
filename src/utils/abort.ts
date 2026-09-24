import { CanceledError } from '../error/types.js'

/** The part of `AbortSignal` this SDK uses. */
export interface AbortSignalLike {
  /** Whether cancellation has already been requested. */
  readonly aborted: boolean
  addEventListener(type: 'abort', listener: () => void): void
  removeEventListener(type: 'abort', listener: () => void): void
}

/** Throws `CanceledError` if the signal has already fired. */
export function throwIfAborted(signal?: AbortSignalLike): void {
  if (signal !== undefined && signal.aborted) throw new CanceledError()
}

/** Resolves with `promise`, or rejects with `CanceledError` when `signal` fires. */
export function raceAbort<T>(promise: Promise<T>, signal: AbortSignalLike): Promise<T> {
  if (signal.aborted) return Promise.reject(new CanceledError())
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort)
      reject(new CanceledError())
    }
    signal.addEventListener('abort', onAbort)
    promise.then(
      (value: T) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (err: Error) => {
        signal.removeEventListener('abort', onAbort)
        reject(err)
      },
    )
  })
}
