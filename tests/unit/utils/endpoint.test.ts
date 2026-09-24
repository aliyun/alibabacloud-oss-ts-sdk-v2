import { describe, expect, it } from 'vitest'
import { endpointFromRegion, parseEndpoint } from '../../../src/utils/endpoint.js'
import type { ParsedEndpoint } from '../../../src/utils/endpoint.js'

const HANGZHOU: ParsedEndpoint = {
  scheme: 'https',
  host: 'oss-cn-hangzhou.aliyuncs.com',
  hostname: 'oss-cn-hangzhou.aliyuncs.com',
}

describe('parseEndpoint', () => {
  it('adds the default scheme to a bare host', () => {
    expect(parseEndpoint('oss-cn-hangzhou.aliyuncs.com', 'https')).toEqual(HANGZHOU)
  })

  it('keeps an explicit scheme and lowercases it', () => {
    expect(parseEndpoint('HTTP://oss-cn-hangzhou.aliyuncs.com', 'https')?.scheme).toBe('http')
  })

  it('keeps the port in host and strips it from hostname', () => {
    expect(parseEndpoint('http://127.0.0.1:8080', 'https')).toEqual({
      scheme: 'http',
      host: '127.0.0.1:8080',
      hostname: '127.0.0.1',
    })
  })

  it('unwraps a bracketed IPv6 literal into hostname', () => {
    expect(parseEndpoint('http://[::1]:8080', 'https')).toEqual({
      scheme: 'http',
      host: '[::1]:8080',
      hostname: '::1',
    })
  })

  it('discards any path, query or fragment', () => {
    expect(parseEndpoint('https://oss-cn-hangzhou.aliyuncs.com/some/path?a=1#f', 'https')).toEqual(HANGZHOU)
    // Separately: with no path before it, each of `?` and `#` must itself end the host.
    expect(parseEndpoint('https://oss-cn-hangzhou.aliyuncs.com?a=1', 'https')).toEqual(HANGZHOU)
    expect(parseEndpoint('https://oss-cn-hangzhou.aliyuncs.com#f', 'https')).toEqual(HANGZHOU)
  })

  it('trims surrounding whitespace', () => {
    expect(parseEndpoint('  oss-cn-hangzhou.aliyuncs.com  ', 'https')).toEqual(HANGZHOU)
  })

  it('rejects an empty endpoint', () => {
    expect(parseEndpoint('', 'https')).toBeUndefined()
    expect(parseEndpoint('   ', 'https')).toBeUndefined()
  })

  it('rejects a scheme other than http or https', () => {
    expect(parseEndpoint('ftp://oss-cn-hangzhou.aliyuncs.com', 'https')).toBeUndefined()
  })

  it('rejects a scheme with no host', () => {
    expect(parseEndpoint('https://', 'https')).toBeUndefined()
    expect(parseEndpoint('https:///path', 'https')).toBeUndefined()
  })

  it('rejects credentials, whitespace and control characters in the host', () => {
    expect(parseEndpoint('https://user:pass@oss-cn-hangzhou.aliyuncs.com', 'https')).toBeUndefined()
    expect(parseEndpoint('https://oss cn.aliyuncs.com', 'https')).toBeUndefined()
    // DEL is above `CHAR_SPACE` and is not `CHAR_AT`, so only the `c === CHAR_DEL` arm catches it.
    expect(parseEndpoint('https://oss\x7f.aliyuncs.com', 'https')).toBeUndefined()
  })

  // Non-empty host but empty hostname: otherwise these parse "successfully" and later get a bucket
  // glued to the front of an empty hostname.
  it('rejects a host with no hostname in it', () => {
    expect(parseEndpoint(':8080', 'https')).toBeUndefined()
    expect(parseEndpoint('https://[]', 'https')).toBeUndefined()
    expect(parseEndpoint('http://[::1', 'https')).toBeUndefined()
  })
})

describe('endpointFromRegion', () => {
  it('derives every endpoint type', () => {
    expect(endpointFromRegion('cn-hangzhou', 'public', 'https')).toBe('https://oss-cn-hangzhou.aliyuncs.com')
    expect(endpointFromRegion('cn-hangzhou', 'internal', 'https')).toBe(
      'https://oss-cn-hangzhou-internal.aliyuncs.com',
    )
    expect(endpointFromRegion('cn-hangzhou', 'dualstack', 'https')).toBe('https://cn-hangzhou.oss.aliyuncs.com')
    expect(endpointFromRegion('cn-hangzhou', 'accelerate', 'https')).toBe('https://oss-accelerate.aliyuncs.com')
  })

  it('honours the scheme', () => {
    expect(endpointFromRegion('cn-hangzhou', 'public', 'http')).toBe('http://oss-cn-hangzhou.aliyuncs.com')
  })
})
