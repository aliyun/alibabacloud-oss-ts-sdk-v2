import { describe, expect, it } from 'vitest'
import { addMimeType, lookupMimeType } from '../../../src/utils/mime-type.js'

describe('lookupMimeType', () => {
  it('looks up known extensions case-insensitively', () => {
    expect(lookupMimeType('dir/image.PNG')).toBe('image/png')
    expect(lookupMimeType('dir\\page.HTML')).toBe('text/html')
  })

  it('returns the supplied default only after lookup misses', () => {
    expect(lookupMimeType('file.unknown')).toBeUndefined()
    expect(lookupMimeType('file.unknown', 'application/octet-stream')).toBe('application/octet-stream')
    expect(lookupMimeType('no-extension', '')).toBe('')
  })

  it('accepts user extensions with or without a leading dot', () => {
    addMimeType({ '.DOCX': 'application/x-user-docx', custommime: 'application/x-custom' })

    expect(lookupMimeType('report.docx')).toBe('application/x-user-docx')
    expect(lookupMimeType('object.CUSTOMMIME')).toBe('application/x-custom')
  })

  it('lets a later user mapping replace an earlier one', () => {
    addMimeType({ replaceablemime: 'application/x-first' })
    addMimeType({ '.REPLACEABLEMIME': 'application/x-second' })

    expect(lookupMimeType('object.replaceablemime')).toBe('application/x-second')
  })

  it('uses only the final extension in the name', () => {
    addMimeType({ gz: 'application/x-gzip-test' })

    expect(lookupMimeType('archive.tar.GZ')).toBe('application/x-gzip-test')
    expect(lookupMimeType('archive.gz?download=1')).toBeUndefined()
  })
})
