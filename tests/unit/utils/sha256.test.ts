import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hmacSha256, sha256 } from '../../../src/utils/sha256.js'
import { utf8Encode } from '../../../src/utils/bytes.js'
import { toHex } from '../../../src/utils/hex.js'

function sha256Hex(input: string): string {
  return toHex(sha256(utf8Encode(input)))
}

function nodeSha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function nodeHmac(key: Uint8Array, data: Uint8Array): string {
  return createHmac('sha256', key).update(data).digest('hex')
}

function bytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i++) out[i] = (i * 31 + seed) & 0xff
  return out
}

describe('sha256', () => {
  it('matches the published FIPS 180-4 vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
  })

  it('produces 32 bytes', () => {
    expect(sha256(utf8Encode('hello')).length).toBe(32)
  })

  it('agrees with node:crypto at every length from 0 to 200 bytes', () => {
    for (let length = 0; length <= 200; length++) {
      const data = bytes(length, 7)
      expect(toHex(sha256(data))).toBe(nodeSha256(data))
    }
  })

  it('agrees with node:crypto across the padding boundaries', () => {
    for (const length of [55, 56, 57, 63, 64, 65, 119, 120, 121, 128, 1000, 4096]) {
      const data = bytes(length, 3)
      expect(toHex(sha256(data))).toBe(nodeSha256(data))
    }
  })

  it('hashes by bytes, not characters', () => {
    expect(sha256Hex('中文')).toBe(toHex(sha256(new Uint8Array([0xe4, 0xb8, 0xad, 0xe6, 0x96, 0x87]))))
  })

  // A subarray has a non-zero byteOffset, so reaching for `data.buffer` digests the wrong bytes.
  it('digests a view into a larger buffer, not the whole buffer', () => {
    const whole = utf8Encode('abcde')
    expect(toHex(sha256(whole.subarray(1, 4)))).toBe('a6b0f90d2ac2b8d1f250c687301aef132049e9016df936680e81fa7bc7d81d70')
  })

  it('does not mutate its input', () => {
    const data = utf8Encode('abc')
    sha256(data)
    expect(Array.from(data)).toEqual([0x61, 0x62, 0x63])
  })
})

describe('hmacSha256', () => {
  it('matches the published RFC 4231 vectors', () => {
    const key = new Uint8Array(20).fill(0x0b)
    expect(toHex(hmacSha256(key, utf8Encode('Hi There')))).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    )
    expect(toHex(hmacSha256(utf8Encode('Jefe'), utf8Encode('what do ya want for nothing?')))).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    )
  })

  it('matches the widely quoted quick-brown-fox vector', () => {
    expect(toHex(hmacSha256(utf8Encode('key'), utf8Encode('The quick brown fox jumps over the lazy dog')))).toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    )
  })

  it('agrees with node:crypto for keys shorter than, equal to, and longer than the block size', () => {
    for (const keyLength of [1, 32, 63, 64, 65, 100, 200]) {
      const key = bytes(keyLength, 11)
      const data = utf8Encode('canonical-request-stand-in')
      expect(toHex(hmacSha256(key, data))).toBe(nodeHmac(key, data))
    }
  })

  it('agrees with node:crypto at every message length from 0 to 100 bytes', () => {
    const key = utf8Encode('OSSSecretAccessKeyStandIn')
    for (let length = 0; length <= 100; length++) {
      const data = bytes(length, 5)
      expect(toHex(hmacSha256(key, data))).toBe(nodeHmac(key, data))
    }
  })

  it('reproduces the v4 signing-key chain', () => {
    const stages = ['20231203', 'cn-hangzhou', 'oss', 'aliyun_v4_request']
    let ours = hmacSha256(utf8Encode('aliyun_v4secret'), utf8Encode(stages[0]))
    for (const stage of stages.slice(1)) ours = hmacSha256(ours, utf8Encode(stage))

    let theirs = createHmac('sha256', 'aliyun_v4secret').update(stages[0]).digest()
    for (const stage of stages.slice(1)) theirs = createHmac('sha256', theirs).update(stage).digest()

    expect(toHex(ours)).toBe(theirs.toString('hex'))
  })

  // Both arguments: key and message take different paths into scratch (`block` vs `inner`).
  it('digests a key and a message that are views into larger buffers', () => {
    const key = utf8Encode('XXkeyXX').subarray(2, 5)
    const data = utf8Encode('YYdataYY').subarray(2, 6)
    expect(toHex(hmacSha256(key, data))).toBe('5031fe3d989c6d1537a013fa6e739da23463fdaec3b70137d828e36ace221bd0')
  })

  it('does not mutate its key or its data', () => {
    const key = utf8Encode('key')
    const data = utf8Encode('data')
    hmacSha256(key, data)
    expect(Array.from(key)).toEqual([0x6b, 0x65, 0x79])
    expect(Array.from(data)).toEqual([0x64, 0x61, 0x74, 0x61])
  })
})
