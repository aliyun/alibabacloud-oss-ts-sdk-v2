import { describe, expect, it } from 'vitest'
import { lookupMimeType } from '../../src/utils/mime-type.js'

describe('browser MIME lookup', () => {
  it('uses the built-in table when the platform has no MIME database', () => {
    expect(lookupMimeType('document.xml')).toBe('text/xml')
  })

  it('falls through to the caller default when platform and built-in tables miss', () => {
    expect(lookupMimeType('document.docx', 'application/fallback')).toBe('application/fallback')
  })
})
