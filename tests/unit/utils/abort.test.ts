import { describe, expect, it } from 'vitest'
import { raceAbort, throwIfAborted } from '../../../src/utils/abort.js'
import { CanceledError } from '../../../src/error/types.js'
import { controllableSignal } from '../../fixtures/abort-signal.js'

describe('throwIfAborted', () => {
  it('does nothing without a signal or when not aborted', () => {
    expect(() => throwIfAborted(undefined)).not.toThrow()
    expect(() => throwIfAborted(controllableSignal().signal)).not.toThrow()
  })

  it('throws CanceledError once aborted', () => {
    const c = controllableSignal()
    c.abort()
    expect(() => throwIfAborted(c.signal)).toThrow(CanceledError)
  })
})

describe('raceAbort', () => {
  it('resolves with the value and unregisters its listener', async () => {
    const c = controllableSignal()
    await expect(raceAbort(Promise.resolve(7), c.signal)).resolves.toBe(7)
    expect(c.attachCount).toBe(1)
    expect(c.listenerCount).toBe(0)
  })

  it('rejects with the original error and unregisters its listener', async () => {
    const c = controllableSignal()
    const boom = new Error('boom')
    await expect(raceAbort(Promise.reject(boom), c.signal)).rejects.toBe(boom)
    expect(c.attachCount).toBe(1)
    expect(c.listenerCount).toBe(0)
  })

  it('rejects with CanceledError as soon as the signal fires, without waiting for the promise', async () => {
    const c = controllableSignal()
    const never = new Promise<number>(() => {})
    const raced = raceAbort(never, c.signal)
    c.abort()
    await expect(raced).rejects.toBeInstanceOf(CanceledError)
    expect(c.attachCount).toBe(1)
    expect(c.listenerCount).toBe(0)
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const c = controllableSignal()
    c.abort()
    await expect(raceAbort(Promise.resolve(1), c.signal)).rejects.toBeInstanceOf(CanceledError)
    expect(c.attachCount).toBe(0)
  })
})
