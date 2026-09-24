import type { AbortSignalLike } from '../../src/utils/abort.js'

export interface ControllableSignal {
  readonly signal: AbortSignalLike
  /** Sets `aborted` and fires every registered listener, as a real AbortSignal does. */
  abort(): void
  /** Listeners still registered. */
  readonly listenerCount: number
  /** Listeners ever registered. */
  readonly attachCount: number
}

// A settable stand-in for `AbortSignalLike`.
export function controllableSignal(): ControllableSignal {
  const listeners: Array<() => void> = []
  let attachCount = 0
  let aborted = false
  const signal: AbortSignalLike = {
    get aborted(): boolean {
      return aborted
    },
    addEventListener: (_type: 'abort', listener: () => void) => {
      attachCount += 1
      listeners.push(listener)
    },
    removeEventListener: (_type: 'abort', listener: () => void) => {
      const at = listeners.indexOf(listener)
      if (at >= 0) listeners.splice(at, 1)
    },
  }
  return {
    signal,
    // Iterates a copy: a listener that removes itself mutates the array it is being read from.
    abort: () => {
      aborted = true
      for (const listener of [...listeners]) listener()
    },
    get listenerCount(): number {
      return listeners.length
    },
    get attachCount(): number {
      return attachCount
    },
  }
}
