import { describe, expect, it } from 'vitest'
import { canonicalizedHeaders } from '../../../src/utils/header.js'
import { createHeaderFields } from '../../../src/utils/header-fields.js'

const acceptOss = (lower: string): boolean => lower.startsWith('x-oss-')

describe('canonicalizedHeaders', () => {
  it('emits the names the predicate accepts and no others', () => {
    const headers = createHeaderFields({ 'x-oss-meta-author': 'alice', 'Content-Type': 'text/html', 'x-oss-head1': 'value' })
    expect(canonicalizedHeaders(headers, acceptOss)).toBe('x-oss-head1:value\nx-oss-meta-author:alice\n')
  })

  it('passes the lowercased name to the predicate', () => {
    const seen: string[] = []
    canonicalizedHeaders(createHeaderFields({ 'X-Oss-Head1': 'value', 'Content-Type': 'text/html' }), (lower) => {
      seen.push(lower)
      return false
    })
    expect(seen).toEqual(['x-oss-head1', 'content-type'])
  })

  it('lowercases the names it emits and sorts them', () => {
    const headers = createHeaderFields({ 'X-Oss-Meta-Z': 'z', 'x-oss-meta-a': 'a' })
    expect(canonicalizedHeaders(headers, acceptOss)).toBe('x-oss-meta-a:a\nx-oss-meta-z:z\n')
  })

  it('sorts a name before the longer name it is a prefix of', () => {
    const headers = createHeaderFields({ 'x-oss-copy-source-range': 'bytes=0-9', 'x-oss-copy-source': '/src/obj' })
    expect(canonicalizedHeaders(headers, acceptOss)).toBe(
      'x-oss-copy-source:/src/obj\nx-oss-copy-source-range:bytes=0-9\n',
    )
  })

  it('trims each value', () => {
    expect(canonicalizedHeaders(createHeaderFields({ 'x-oss-meta-author': '  alice  ' }), acceptOss)).toBe('x-oss-meta-author:alice\n')
  })

  // Two spellings of one name can no longer coexist: `HeaderFields` keys by lowercase, so the second
  // set overwrites the first and only the surviving value is emitted.
  it('collapses two spellings of one name to a single field, last write winning', () => {
    const headers = createHeaderFields({ 'x-oss-head1': ' first ', 'X-Oss-Head1': ' second ' })
    expect(canonicalizedHeaders(headers, acceptOss)).toBe('x-oss-head1:second\n')
  })

  it('emits a line for an accepted name whose value is empty', () => {
    expect(canonicalizedHeaders(createHeaderFields({ 'x-oss-head1': '' }), acceptOss)).toBe('x-oss-head1:\n')
  })

  it('gives an empty string for an empty record', () => {
    expect(canonicalizedHeaders(createHeaderFields({}), acceptOss)).toBe('')
  })

  it('gives an empty string when the predicate accepts nothing', () => {
    expect(canonicalizedHeaders(createHeaderFields({ 'Content-Type': 'text/html' }), acceptOss)).toBe('')
  })
})
