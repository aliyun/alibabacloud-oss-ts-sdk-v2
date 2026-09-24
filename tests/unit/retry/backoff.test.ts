import { describe, expect, it } from 'vitest'
import { FixedDelayBackoff, FullJitterBackoff } from '../../../src/retry/backoff.js'

const anyError = new Error('boom')

describe('FullJitterBackoff', () => {
  it('scales the ceiling as base * 2^attempt and applies the jitter factor', () => {
    const backoff = new FullJitterBackoff(200, 20_000, () => 0.5)
    expect(backoff.backoffDelay(0, anyError)).toBe(100)
    expect(backoff.backoffDelay(1, anyError)).toBe(200)
    expect(backoff.backoffDelay(2, anyError)).toBe(400)
    expect(backoff.backoffDelay(3, anyError)).toBe(800)
    expect(backoff.backoffDelay(6, anyError)).toBe(6400)
  })

  it('clamps the ceiling at maxBackoff', () => {
    const backoff = new FullJitterBackoff(200, 20_000, () => 0.5)
    // 200 * 2^7 = 25600 > 20000
    expect(backoff.backoffDelay(7, anyError)).toBe(10_000)
    expect(backoff.backoffDelay(20, anyError)).toBe(10_000)
  })

  it('stays non-negative at attempt counts that would overflow a 32-bit shift', () => {
    const backoff = new FullJitterBackoff(200, 20_000, () => 0.5)
    // `1 << 31` is -2147483648 in JavaScript and `1 << 32` is 1; both would corrupt the ceiling.
    expect(backoff.backoffDelay(31, anyError)).toBe(10_000)
    expect(backoff.backoffDelay(32, anyError)).toBe(10_000)
    expect(backoff.backoffDelay(1000, anyError)).toBe(10_000)
    // 2^1024 is where Math.pow reaches Infinity, which Math.min must still clamp.
    expect(backoff.backoffDelay(1024, anyError)).toBe(10_000)
  })

  it('returns zero when the jitter factor is zero and approaches the ceiling as it approaches one', () => {
    expect(new FullJitterBackoff(200, 20_000, () => 0).backoffDelay(3, anyError)).toBe(0)
    expect(new FullJitterBackoff(200, 20_000, () => 0.999).backoffDelay(1, anyError)).toBeCloseTo(399.6, 6)
  })

  it('defaults the jitter source to Math.random and stays inside the ceiling', () => {
    const backoff = new FullJitterBackoff(200, 20_000)
    const samples: number[] = []
    for (let i = 0; i < 200; i += 1) {
      const delay = backoff.backoffDelay(2, anyError)
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThan(800)
      samples.push(delay)
    }
    expect(new Set(samples).size).toBeGreaterThan(1)
  })
})

describe('FixedDelayBackoff', () => {
  it('ignores the attempt number', () => {
    const backoff = new FixedDelayBackoff(500)
    expect(backoff.backoffDelay(0, anyError)).toBe(500)
    expect(backoff.backoffDelay(1, anyError)).toBe(500)
    expect(backoff.backoffDelay(9, anyError)).toBe(500)
  })
})
