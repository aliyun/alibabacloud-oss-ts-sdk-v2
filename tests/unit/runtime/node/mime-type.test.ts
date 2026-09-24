import { describe, expect, it } from 'vitest'
import { lookupPlatformMimeType } from '../../../../src/runtime/mime-type.js'
import { lookupMimeType } from '../../../../src/utils/mime-type.js'

describe('node MIME lookup', () => {
  it('uses the Node MIME database', () => {
    expect(lookupPlatformMimeType('.txt')).toBe('text/plain')
    expect(lookupPlatformMimeType('.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
  })

  it('uses the platform result before the built-in table', () => {
    expect(lookupMimeType('document.xml')).toBe('application/xml')
  })

  it('returns undefined for an unknown extension', () => {
    expect(lookupPlatformMimeType('.unknown-oss-extension')).toBeUndefined()
  })
})
