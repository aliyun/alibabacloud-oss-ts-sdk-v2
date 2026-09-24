import { describe, expect, it } from 'vitest'
import { RequestError, ServiceError } from '../../../src/error/types.js'
import { FixedDelayBackoff } from '../../../src/retry/backoff.js'
import {
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_BACKOFF_MS,
  NopRetryer,
  StandardRetryer,
} from '../../../src/retry/standard.js'

function serviceError(statusCode: number, code: string): ServiceError {
  return new ServiceError({ statusCode, code, message: 'm', requestId: 'R', ec: '', headers: {} })
}

describe('defaults', () => {
  it('are three attempts, a 200ms base delay and a 20s ceiling', () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(3)
    expect(DEFAULT_BASE_DELAY_MS).toBe(200)
    expect(DEFAULT_MAX_BACKOFF_MS).toBe(20_000)
  })
})

describe('StandardRetryer', () => {
  it('defaults to three attempts and full-jitter backoff inside the ceiling', () => {
    const retryer = new StandardRetryer()
    expect(retryer.maxAttempts()).toBe(3)
    const delay = retryer.retryDelay(2, serviceError(500, 'InternalError'))
    expect(delay).toBeGreaterThanOrEqual(0)
    expect(delay).toBeLessThan(800)
    // ceiling = min(200 * 2^2, 20_000) = 800
    expect(new StandardRetryer({ random: () => 0.5 }).retryDelay(2, new Error('x'))).toBe(400)
  })

  it('applies the default retryable set', () => {
    const retryer = new StandardRetryer()
    expect(retryer.isErrorRetryable(serviceError(503, 'ServiceUnavailable'))).toBe(true)
    expect(retryer.isErrorRetryable(serviceError(403, 'RequestTimeTooSkewed'))).toBe(true)
    expect(retryer.isErrorRetryable(new RequestError('connection reset'))).toBe(true)
    expect(retryer.isErrorRetryable(serviceError(404, 'NoSuchKey'))).toBe(false)
  })

  it('honours an explicit maxAttempts and backoff', () => {
    const retryer = new StandardRetryer({ maxAttempts: 5, backoff: new FixedDelayBackoff(7) })
    expect(retryer.maxAttempts()).toBe(5)
    expect(retryer.retryDelay(2, new Error('x'))).toBe(7)
  })

  it('falls back to the defaults for a non-positive maxAttempts and baseDelayMs', () => {
    const retryer = new StandardRetryer({ maxAttempts: 0, baseDelayMs: -1, random: () => 0.5 })
    expect(retryer.maxAttempts()).toBe(3)
    // ceiling = min(DEFAULT_BASE_DELAY_MS * 2^0, 20_000) = 200
    expect(retryer.retryDelay(0, new Error('x'))).toBe(100)
  })

  it('falls back to the default ceiling for a non-positive maxBackoffMs', () => {
    const retryer = new StandardRetryer({ maxBackoffMs: 0, baseDelayMs: 1000, random: () => 0.5 })
    // ceiling = min(1000 * 2^10, 20_000) = 20_000
    expect(retryer.retryDelay(10, new Error('x'))).toBe(10_000)
  })

  it('falls back to the defaults for NaN, which a coerced missing setting produces', () => {
    const retryer = new StandardRetryer({
      maxAttempts: Number.NaN,
      baseDelayMs: Number.NaN,
      maxBackoffMs: Number.NaN,
      random: () => 0.5,
    })
    expect(retryer.maxAttempts()).toBe(3)
    expect(retryer.retryDelay(0, new Error('x'))).toBe(100)
  })

  it('honours a custom retryable set exclusively', () => {
    const retryer = new StandardRetryer({
      errorRetryables: [{ isErrorRetryable: (error) => error.message === 'yes' }],
    })
    expect(retryer.isErrorRetryable(new Error('yes'))).toBe(true)
    expect(retryer.isErrorRetryable(serviceError(500, 'InternalError'))).toBe(false)
  })

  // A `??` fallback would treat the empty array as absent and re-enable every default retryable.
  it('honours an explicitly empty retryable set rather than restoring the defaults', () => {
    const retryer = new StandardRetryer({ errorRetryables: [] })
    expect(retryer.isErrorRetryable(serviceError(500, 'InternalError'))).toBe(false)
  })

  it('derives the backoff from baseDelayMs and maxBackoffMs when no backoff is given', () => {
    const retryer = new StandardRetryer({ baseDelayMs: 1000, maxBackoffMs: 3000, random: () => 0.5 })
    // ceiling = min(1000 * 2^2, 3000) = 3000
    expect(retryer.retryDelay(2, new Error('x'))).toBe(1500)
  })
})

describe('NopRetryer', () => {
  it('never retries', () => {
    const retryer = new NopRetryer()
    expect(retryer.maxAttempts()).toBe(1)
    expect(retryer.isErrorRetryable(serviceError(500, 'InternalError'))).toBe(false)
    expect(retryer.retryDelay(2, new Error('x'))).toBe(0)
  })
})
