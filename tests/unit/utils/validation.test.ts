import { describe, expect, it } from 'vitest'
import { isIpAddress, isValidBucketName, isValidObjectName, isValidRegion } from '../../../src/utils/validation.js'

describe('isValidRegion', () => {
  it('accepts lowercase letters, digits and hyphens', () => {
    expect(isValidRegion('cn-hangzhou')).toBe(true)
    expect(isValidRegion('ap-southeast-1')).toBe(true)
  })

  it('rejects an empty region', () => {
    expect(isValidRegion('')).toBe(false)
  })

  // Catches passing an endpoint where a region belongs, before it reaches a v4 credential scope.
  it('rejects uppercase, dots, underscores and non-ASCII', () => {
    expect(isValidRegion('CN-Hangzhou')).toBe(false)
    expect(isValidRegion('oss-cn-hangzhou.aliyuncs.com')).toBe(false)
    expect(isValidRegion('cn_hangzhou')).toBe(false)
    expect(isValidRegion('cn-杭州')).toBe(false)
  })
})

describe('isValidBucketName', () => {
  it('accepts a well-formed name', () => {
    expect(isValidBucketName('examplebucket')).toBe(true)
    expect(isValidBucketName('my-bucket-1')).toBe(true)
    expect(isValidBucketName('abc')).toBe(true)
  })

  it('rejects undefined', () => {
    expect(isValidBucketName(undefined)).toBe(false)
  })

  it('enforces the 3..63 length range', () => {
    expect(isValidBucketName('ab')).toBe(false)
    expect(isValidBucketName('a'.repeat(63))).toBe(true)
    expect(isValidBucketName('a'.repeat(64))).toBe(false)
  })

  it('rejects a leading or trailing hyphen', () => {
    expect(isValidBucketName('-bucket')).toBe(false)
    expect(isValidBucketName('bucket-')).toBe(false)
  })

  it('rejects uppercase, dots and underscores', () => {
    expect(isValidBucketName('MyBucket')).toBe(false)
    expect(isValidBucketName('my.bucket')).toBe(false)
    expect(isValidBucketName('my_bucket')).toBe(false)
  })

  it('rejects non-ASCII names whichever half of the check catches them', () => {
    expect(isValidBucketName('中中')).toBe(false)
    expect(isValidBucketName('a'.repeat(62) + '中')).toBe(false)
  })
})

describe('isValidObjectName', () => {
  it('accepts any non-empty key within the length bound', () => {
    expect(isValidObjectName('a/b.txt')).toBe(true)
    expect(isValidObjectName(' ')).toBe(true)
    expect(isValidObjectName('中文/键')).toBe(true)
  })

  it('rejects undefined and the empty string', () => {
    expect(isValidObjectName(undefined)).toBe(false)
    expect(isValidObjectName('')).toBe(false)
  })

  // Client-side pre-check on key length: 1024 is the last accepted, 1025 the first rejected.
  it('rejects a key longer than 1024', () => {
    expect(isValidObjectName('k'.repeat(1024))).toBe(true)
    expect(isValidObjectName('k'.repeat(1025))).toBe(false)
  })
})

describe('isIpAddress', () => {
  it('recognises IPv4', () => {
    expect(isIpAddress('127.0.0.1')).toBe(true)
    expect(isIpAddress('255.255.255.255')).toBe(true)
  })

  it('recognises an unbracketed IPv6 literal', () => {
    expect(isIpAddress('::1')).toBe(true)
    expect(isIpAddress('2001:db8::1')).toBe(true)
  })

  it('rejects host names and malformed dotted quads', () => {
    expect(isIpAddress('oss-cn-hangzhou.aliyuncs.com')).toBe(false)
    expect(isIpAddress('1.2.3')).toBe(false)
    expect(isIpAddress('1.2.3.4.5')).toBe(false)
    expect(isIpAddress('256.1.1.1')).toBe(false)
    expect(isIpAddress('1.2.3.a')).toBe(false)
    expect(isIpAddress('1.2.3.')).toBe(false)
  })

  // Accepting these is the safe direction.
  it('accepts leading zeros in a dotted quad', () => {
    expect(isIpAddress('010.1.1.1')).toBe(true)
    expect(isIpAddress('0010.1.1.1')).toBe(true)
  })
})
