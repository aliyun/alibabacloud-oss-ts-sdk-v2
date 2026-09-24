import { describe, expect, it } from 'vitest'
import { normalizeHeaders } from '../../../../src/runtime/harmony/headers.js'

describe('normalizeHeaders', () => {
  it('lowercases the names', () => {
    expect(normalizeHeaders({ ETag: '"abc"', 'X-OSS-Request-Id': 'RID' })).toEqual({
      etag: '"abc"',
      'x-oss-request-id': 'RID',
    })
  })

  it('joins repeated values with ", "', () => {
    expect(normalizeHeaders({ 'Set-Cookie': ['a=1', 'b=2'] })['set-cookie']).toBe('a=1, b=2')
  })

  it('stringifies numeric values', () => {
    expect(normalizeHeaders({ 'Content-Length': 42 })['content-length']).toBe('42')
  })

  it('drops undefined values rather than emitting "undefined"', () => {
    const headers = normalizeHeaders({ ETag: undefined, 'Content-Type': 'text/xml' })
    expect('etag' in headers).toBe(false)
    expect(headers['content-type']).toBe('text/xml')
  })
})
