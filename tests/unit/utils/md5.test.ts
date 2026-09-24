import { describe, expect, it } from 'vitest'
import { md5 } from '../../../src/utils/md5.js'
import { utf8Encode } from '../../../src/utils/bytes.js'
import { toHex } from '../../../src/utils/hex.js'
import { toBase64 } from '../../../src/utils/base64.js'

function md5Hex(input: string): string {
  return toHex(md5(utf8Encode(input)))
}

describe('md5', () => {
  it('matches the RFC 1321 test suite', () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5Hex('a')).toBe('0cc175b9c0f1b6a831c399e269772661')
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5Hex('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0')
    expect(md5Hex('abcdefghijklmnopqrstuvwxyz')).toBe('c3fcd3d76192e4007dfb496cca67e13b')
    expect(md5Hex('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')).toBe('d174ab98d277d9f5a5611c2c9f419d9f')
    expect(md5Hex('12345678901234567890123456789012345678901234567890123456789012345678901234567890')).toBe('57edf4a22be3c955ac49da2e2107b67a')
  })

  // 56 is where the length field no longer fits the first block; these bracket that transition.
  // Every expectation was measured against node:crypto.
  it('handles inputs that land exactly on a block boundary', () => {
    expect(md5Hex('a'.repeat(55))).toBe('ef1772b6dff9a122358552954ad0df65')
    expect(md5Hex('a'.repeat(56))).toBe('3b0c8ac703f828b04c6c197006d17218')
    expect(md5Hex('a'.repeat(63))).toBe('b06521f39153d618550606be297466d5')
    expect(md5Hex('a'.repeat(64))).toBe('014842d480b571495a4a0363793f7367')
    expect(md5Hex('a'.repeat(65))).toBe('c743a45e0d2e6a95cb859adae0248435')
  })

  it('digests multi-byte input by bytes, not by characters', () => {
    expect(md5Hex('中文')).toBe('a7bac2239fcdcb3a067903d8077c4a07')
    expect(md5(new Uint8Array([0xe4, 0xb8, 0xad, 0xe6, 0x96, 0x87]))).toEqual(md5(utf8Encode('中文')))
  })

  // A subarray has a non-zero byteOffset, so reaching for `data.buffer` digests the wrong bytes.
  it('digests a view into a larger buffer, not the whole buffer', () => {
    const whole = utf8Encode('abcde')
    expect(toHex(md5(whole.subarray(1, 4)))).toBe('d4b7c284882ca9e208bb65e8abd5f4c8')
  })

  it('produces 16 bytes that base64-encode to the Content-MD5 shape', () => {
    const digest = md5(utf8Encode('hello'))
    expect(digest.length).toBe(16)
    expect(toBase64(digest)).toBe('XUFAKrxLKna5cZ2REBfFkg==')
  })
})
