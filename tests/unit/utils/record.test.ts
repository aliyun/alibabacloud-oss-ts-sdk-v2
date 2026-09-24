import { describe, expect, it } from 'vitest'
import { copyInto, lowerCaseKeys } from '../../../src/utils/record.js'

describe('copyInto', () => {
  it('copies every key', () => {
    const dst: Record<string, string> = { a: '1' }
    copyInto(dst, { b: '2' })
    expect(dst).toEqual({ a: '1', b: '2' })
  })

  it('overwrites existing keys', () => {
    const dst: Record<string, string> = { a: '1' }
    copyInto(dst, { a: '2' })
    expect(dst).toEqual({ a: '2' })
  })

  it('tolerates an undefined source', () => {
    const dst: Record<string, string> = { a: '1' }
    copyInto(dst, undefined)
    expect(dst).toEqual({ a: '1' })
  })
})

describe('lowerCaseKeys', () => {
  it('lowercases keys and keeps values verbatim', () => {
    expect(lowerCaseKeys({ 'X-Oss-Meta-A': 'V', 'ETag': '"abc"' })).toEqual({ 'x-oss-meta-a': 'V', etag: '"abc"' })
  })
})
