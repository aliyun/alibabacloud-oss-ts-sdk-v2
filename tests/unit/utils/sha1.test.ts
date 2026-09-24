import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hmacSha1, sha1 } from '../../../src/utils/sha1.js'
import { utf8Encode } from '../../../src/utils/bytes.js'
import { toHex } from '../../../src/utils/hex.js'

function sha1Hex(input: string): string {
  return toHex(sha1(utf8Encode(input)))
}

function nodeSha1(data: Uint8Array): string {
  return createHash('sha1').update(data).digest('hex')
}

function nodeHmac(key: Uint8Array, data: Uint8Array): string {
  return createHmac('sha1', key).update(data).digest('hex')
}

function bytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i++) out[i] = (i * 31 + seed) & 0xff
  return out
}

describe('sha1', () => {
  it('matches the published FIPS 180-4 vectors', () => {
    expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
    expect(sha1Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
    )
  })

  it('produces 20 bytes', () => {
    expect(sha1(utf8Encode('hello')).length).toBe(20)
  })

  it('agrees with node:crypto at every length from 0 to 200 bytes', () => {
    for (let length = 0; length <= 200; length++) {
      const data = bytes(length, 7)
      expect(toHex(sha1(data))).toBe(nodeSha1(data))
    }
  })

  it('agrees with node:crypto across the padding boundaries', () => {
    for (const length of [55, 56, 57, 63, 64, 65, 119, 120, 121, 128, 1000, 4096]) {
      const data = bytes(length, 3)
      expect(toHex(sha1(data))).toBe(nodeSha1(data))
    }
  })

  it('hashes by bytes, not characters', () => {
    expect(sha1Hex('中文')).toBe(toHex(sha1(new Uint8Array([0xe4, 0xb8, 0xad, 0xe6, 0x96, 0x87]))))
  })

  // A subarray has a non-zero byteOffset, so reaching for `data.buffer` instead of indexing digests wrong bytes.
  it('digests a view into a larger buffer, not the whole buffer', () => {
    const whole = utf8Encode('abcde')
    expect(toHex(sha1(whole.subarray(1, 4)))).toBe(nodeSha1(utf8Encode('bcd')))
  })

  it('does not mutate its input', () => {
    const data = utf8Encode('abc')
    sha1(data)
    expect(Array.from(data)).toEqual([0x61, 0x62, 0x63])
  })
})

describe('hmacSha1', () => {
  it('matches the published RFC 2202 vectors', () => {
    const key = new Uint8Array(20).fill(0x0b)
    expect(toHex(hmacSha1(key, utf8Encode('Hi There')))).toBe('b617318655057264e28bc0b6fb378c8ef146be00')
    expect(toHex(hmacSha1(utf8Encode('Jefe'), utf8Encode('what do ya want for nothing?')))).toBe(
      'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79',
    )
    // RFC 2202 case 6: an 80-byte key, longer than the block, so it is digested first.
    expect(toHex(hmacSha1(new Uint8Array(80).fill(0xaa), utf8Encode('Test Using Larger Than Block-Size Key - Hash Key First')))).toBe(
      'aa4ae5e15272d00e95705637ce8a3b55ed402112',
    )
  })

  it('agrees with node:crypto for keys shorter than, equal to, and longer than the block size', () => {
    for (const keyLength of [1, 32, 63, 64, 65, 100, 200]) {
      const key = bytes(keyLength, 11)
      const data = utf8Encode('string-to-sign-stand-in')
      expect(toHex(hmacSha1(key, data))).toBe(nodeHmac(key, data))
    }
  })

  it('agrees with node:crypto at every message length from 0 to 100 bytes', () => {
    const key = utf8Encode('OSSSecretAccessKeyStandIn')
    for (let length = 0; length <= 100; length++) {
      const data = bytes(length, 5)
      expect(toHex(hmacSha1(key, data))).toBe(nodeHmac(key, data))
    }
  })

  // Both arguments: the key and message take different paths into the scratch buffer.
  it('digests a key and a message that are views into larger buffers', () => {
    const key = utf8Encode('XXkeyXX').subarray(2, 5)
    const data = utf8Encode('YYdataYY').subarray(2, 6)
    expect(toHex(hmacSha1(key, data))).toBe(nodeHmac(utf8Encode('key'), utf8Encode('data')))
  })

  it('does not mutate its key or its data', () => {
    const key = utf8Encode('key')
    const data = utf8Encode('data')
    hmacSha1(key, data)
    expect(Array.from(key)).toEqual([0x6b, 0x65, 0x79])
    expect(Array.from(data)).toEqual([0x64, 0x61, 0x74, 0x61])
  })
})
