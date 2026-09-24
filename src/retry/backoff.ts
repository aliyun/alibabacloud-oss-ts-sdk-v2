import type { BackoffDelayer, RandomSource } from './types.js'

/** `[0, 1) * min(baseDelay * 2^attempt, maxBackoff)`. */
export class FullJitterBackoff implements BackoffDelayer {
  private readonly baseDelayMs: number
  private readonly maxBackoffMs: number
  private readonly random: RandomSource

  constructor(baseDelayMs: number, maxBackoffMs: number, random?: RandomSource) {
    this.baseDelayMs = baseDelayMs
    this.maxBackoffMs = maxBackoffMs
    this.random = random ?? Math.random
  }

  backoffDelay(attempt: number, _error: Error): number {
    const ceiling = Math.min(this.baseDelayMs * Math.pow(2, attempt), this.maxBackoffMs)
    return this.random() * ceiling
  }
}

/** The same delay on every attempt, for a flat retry cadence. */
export class FixedDelayBackoff implements BackoffDelayer {
  private readonly fixedDelayMs: number

  constructor(fixedDelayMs: number) {
    this.fixedDelayMs = fixedDelayMs
  }

  backoffDelay(_attempt: number, _error: Error): number {
    return this.fixedDelayMs
  }
}
