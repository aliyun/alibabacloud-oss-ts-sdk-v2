import { describe, expect, it } from 'vitest'
import { toHex } from '../../../src/utils/hex.js'

describe('toHex', () => {
  it('is lowercase and zero-padded', () => {
    expect(toHex(new Uint8Array([0x00, 0x0f, 0xa0, 0xff]))).toBe('000fa0ff')
  })

  it('returns the empty string for no bytes', () => {
    expect(toHex(new Uint8Array([]))).toBe('')
  })

  it('encodes all 256 byte values against a pinned vector', () => {
    const all = new Uint8Array(256)
    for (let i = 0; i < 256; i++) all[i] = i
    const expected
      = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
      + '202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f'
      + '404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f'
      + '606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f'
      + '808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f'
      + 'a0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebf'
      + 'c0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedf'
      + 'e0e1e2e3e4e5e6e7e8e9eaebecedeeeff0f1f2f3f4f5f6f7f8f9fafbfcfdfeff'
    expect(expected).toHaveLength(512)
    expect(toHex(all)).toBe(expected)
  })
})
