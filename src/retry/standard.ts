import { FullJitterBackoff } from './backoff.js'
import { DEFAULT_ERROR_RETRYABLES } from './retryable.js'
import type { BackoffDelayer, ErrorRetryable, RandomSource, Retryer } from './types.js'

export const DEFAULT_MAX_ATTEMPTS = 3
export const DEFAULT_MAX_BACKOFF_MS = 20_000
export const DEFAULT_BASE_DELAY_MS = 200

export interface RetryOptions {
  /** The total number of attempts, the first one included. */
  maxAttempts?: number
  /** The ceiling on a single backoff delay, in milliseconds. */
  maxBackoffMs?: number
  /** The delay the backoff grows from, in milliseconds. */
  baseDelayMs?: number
  /** How long to wait between attempts. */
  backoff?: BackoffDelayer
  /** Which errors to retry. An empty array disables retry rather than restoring the defaults. */
  errorRetryables?: readonly ErrorRetryable[]
  /** Where the jitter draws from. Only consulted when `backoff` is not supplied. */
  random?: RandomSource
}

function positiveOr(value: number | undefined, fallback: number): number {
  return value !== undefined && value > 0 ? value : fallback
}

/** The default retryer: three attempts, full-jitter backoff, the default set of retryable errors. */
export class StandardRetryer implements Retryer {
  private readonly attempts: number
  private readonly retryables: readonly ErrorRetryable[]
  private readonly backoff: BackoffDelayer

  constructor(options: RetryOptions = {}) {
    const baseDelayMs = positiveOr(options.baseDelayMs, DEFAULT_BASE_DELAY_MS)
    const maxBackoffMs = positiveOr(options.maxBackoffMs, DEFAULT_MAX_BACKOFF_MS)

    this.attempts = positiveOr(options.maxAttempts, DEFAULT_MAX_ATTEMPTS)
    this.retryables = options.errorRetryables ?? DEFAULT_ERROR_RETRYABLES
    this.backoff = options.backoff ?? new FullJitterBackoff(baseDelayMs, maxBackoffMs, options.random)
  }

  maxAttempts(): number {
    return this.attempts
  }

  isErrorRetryable(error: Error): boolean {
    for (const retryable of this.retryables) {
      if (retryable.isErrorRetryable(error)) return true
    }
    return false
  }

  retryDelay(attempt: number, error: Error): number {
    return this.backoff.backoffDelay(attempt, error)
  }
}

/** Disables retry. */
export class NopRetryer implements Retryer {
  maxAttempts(): number {
    return 1
  }

  isErrorRetryable(_error: Error): boolean {
    return false
  }

  /** Returns 0. */
  retryDelay(_attempt: number, _error: Error): number {
    return 0
  }
}
