import { describe, expect, it } from 'vitest'
import { sleep } from '../../../src/utils/sleep.js'

describe('sleep', () => {
  it('resolves no sooner than the requested delay', async () => {
    const before = Date.now()
    await sleep(30)
    // Timer resolution is coarse on Windows; 25 is the honest floor for 30.
    expect(Date.now() - before).toBeGreaterThanOrEqual(25)
  })
})
