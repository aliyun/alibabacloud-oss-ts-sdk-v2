import { describe, expect, it } from 'vitest'
import { lookupPlatformMimeType } from '../../../../src/runtime/mime-type.harmony.js'

describe('OpenHarmony MIME lookup', () => {
  it('reports no platform MIME match', () => {
    expect(lookupPlatformMimeType('.png')).toBeUndefined()
  })
})
