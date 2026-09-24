import { describe, expect, it } from 'vitest'
import { buildQueryString, escapePath, escapeUriComponent, parseEncodedQuery, withQuery } from '../../../src/utils/uri.js'

describe('escapePath', () => {
  it('leaves RFC 3986 unreserved characters alone', () => {
    expect(escapePath('abcXYZ019-._~', false)).toBe('abcXYZ019-._~')
  })

  it('keeps slashes when encodeSlash is false', () => {
    expect(escapePath('a/b/c.txt', false)).toBe('a/b/c.txt')
  })

  it('escapes slashes when encodeSlash is true', () => {
    expect(escapePath('a/b', true)).toBe('a%2Fb')
  })

  it('escapes what encodeURIComponent wrongly leaves alone', () => {
    expect(escapePath("!'()*", false)).toBe('%21%27%28%29%2A')
  })

  it('escapes plus, space and pipe with uppercase hex', () => {
    expect(escapePath('1234+-/123/1.txt', false)).toBe('1234%2B-/123/1.txt')
    expect(escapePath('a b', false)).toBe('a%20b')
    expect(escapePath('|p', false)).toBe('%7Cp')
  })

  it('escapes multi-byte characters byte by byte', () => {
    expect(escapePath('中', false)).toBe('%E4%B8%AD')
  })

  // Expected strings derive from the RFC 3986 unreserved set (ALPHA / DIGIT / `-._~`), not captured
  // from the implementation. Pins `%`, whose un-escaped form in a key like `100%.txt` is a sig mismatch.
  it('escapes every printable ASCII character outside the unreserved set', () => {
    let ascii = ''
    for (let c = 0x20; c < 0x7f; c++) ascii += String.fromCharCode(c)

    expect(escapePath(ascii, false)).toBe(
      '%20%21%22%23%24%25%26%27%28%29%2A%2B%2C-./0123456789%3A%3B%3C%3D%3E%3F%40' +
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ%5B%5C%5D%5E_%60abcdefghijklmnopqrstuvwxyz%7B%7C%7D~',
    )
    expect(escapePath(ascii, true)).toBe(
      '%20%21%22%23%24%25%26%27%28%29%2A%2B%2C-.%2F0123456789%3A%3B%3C%3D%3E%3F%40' +
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ%5B%5C%5D%5E_%60abcdefghijklmnopqrstuvwxyz%7B%7C%7D~',
    )
  })
})

describe('escapeUriComponent', () => {
  it('escapes slashes', () => {
    expect(escapeUriComponent('ak/20231217/cn-hangzhou/oss/aliyun_v4_request'))
      .toBe('ak%2F20231217%2Fcn-hangzhou%2Foss%2Faliyun_v4_request')
  })
})

describe('buildQueryString', () => {
  it('sorts by encoded key, escapes values, and omits the equals sign for empty values', () => {
    const query = buildQueryString({
      'param1': 'value1', '+param1': 'value3', '|param1': 'value4', 'param2': '', '+param2': '', '|param2': '',
      'prefix': 'a b/c+d', 'continuation-token': 'abc+/=',
    })
    expect(query).toBe(
      '%2Bparam1=value3&%2Bparam2&%7Cparam1=value4&%7Cparam2&continuation-token=abc%2B%2F%3D' +
      '&param1=value1&param2&prefix=a%20b%2Fc%2Bd',
    )
  })

  it('returns an empty string for no parameters', () => {
    expect(buildQueryString({})).toBe('')
  })
})

describe('parseEncodedQuery', () => {
  it('leaves the encoding alone, so the pairs can be signed as they were sent', () => {
    expect(parseEncodedQuery('http://b.x/k?prefix=a%20b%2Fc&%2Bparam1=value3&flag')).toEqual({
      'prefix': 'a%20b%2Fc',
      '%2Bparam1': 'value3',
      'flag': '',
    })
  })

  it('rewrites a bare plus as the space it means', () => {
    expect(parseEncodedQuery('http://b.x/k?x-oss-process=a+b')).toEqual({ 'x-oss-process': 'a%20b' })
  })

  it('returns nothing for a URL with no query', () => {
    expect(parseEncodedQuery('http://b.x/k')).toEqual({})
  })
})

describe('withQuery', () => {
  it('replaces an existing query', () => {
    expect(withQuery('http://b.x/k?a=1', 'b=2')).toBe('http://b.x/k?b=2')
  })

  it('leaves no question mark behind for an empty query', () => {
    expect(withQuery('http://b.x/k?a=1', '')).toBe('http://b.x/k')
  })
})
