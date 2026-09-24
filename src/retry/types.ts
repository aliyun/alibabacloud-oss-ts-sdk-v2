// Delays are milliseconds throughout, the unit `setTimeout` takes.

/** Computes how long to wait before a given retry attempt. */
export interface BackoffDelayer {
  /** Milliseconds to wait before `attempt`. */
  backoffDelay(attempt: number, error: Error): number
}

/** Decides whether one class of error is worth another attempt. */
export interface ErrorRetryable {
  isErrorRetryable(error: Error): boolean
}

/** The retry policy the middleware asks: how many attempts, which errors, how long between. */
export interface Retryer {
  /** The total number of attempts, the first one included. */
  maxAttempts(): number
  isErrorRetryable(error: Error): boolean
  /** Milliseconds to wait before `attempt`. Only called when `maxAttempts()` allows a retry. */
  retryDelay(attempt: number, error: Error): number
}

/** Source of the jitter factor, in `[0, 1)`. */
export type RandomSource = () => number
