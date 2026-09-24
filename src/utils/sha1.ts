const BLOCK_BYTES = 64
const DIGEST_BYTES = 20

function rotl(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0
}

/** FIPS 180-4 SHA-1, used by OSS v1 signatures. */
export function sha1(data: Uint8Array): Uint8Array {
  const padded = new Uint8Array(Math.ceil((data.length + 9) / BLOCK_BYTES) * BLOCK_BYTES)
  padded.set(data)
  padded[data.length] = 0x80

  // Big-endian bit length in the final 8 bytes.
  const bits = data.length * 8
  const low = bits % 4294967296
  const high = Math.floor(bits / 4294967296)
  const lengthAt = padded.length - 8
  padded[lengthAt] = (high >>> 24) & 0xff
  padded[lengthAt + 1] = (high >>> 16) & 0xff
  padded[lengthAt + 2] = (high >>> 8) & 0xff
  padded[lengthAt + 3] = high & 0xff
  padded[lengthAt + 4] = (low >>> 24) & 0xff
  padded[lengthAt + 5] = (low >>> 16) & 0xff
  padded[lengthAt + 6] = (low >>> 8) & 0xff
  padded[lengthAt + 7] = low & 0xff

  const h = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0])
  const w = new Uint32Array(80)

  for (let offset = 0; offset < padded.length; offset += BLOCK_BYTES) {
    for (let i = 0; i < 16; i++) {
      const at = offset + i * 4
      w[i] = ((padded[at] << 24) | (padded[at + 1] << 16) | (padded[at + 2] << 8) | padded[at + 3]) >>> 0
    }
    for (let i = 16; i < 80; i++) {
      w[i] = rotl((w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]) >>> 0, 1)
    }

    let a = h[0]
    let b = h[1]
    let c = h[2]
    let d = h[3]
    let e = h[4]

    for (let i = 0; i < 80; i++) {
      let f = 0
      let k = 0
      if (i < 20) {
        f = ((b & c) | (~b & d)) >>> 0
        k = 0x5a827999
      } else if (i < 40) {
        f = (b ^ c ^ d) >>> 0
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = ((b & c) | (b & d) | (c & d)) >>> 0
        k = 0x8f1bbcdc
      } else {
        f = (b ^ c ^ d) >>> 0
        k = 0xca62c1d6
      }
      const temp = (rotl(a, 5) + f + e + k + w[i]) >>> 0
      e = d
      d = c
      c = rotl(b, 30)
      b = a
      a = temp
    }

    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
  }

  const out = new Uint8Array(DIGEST_BYTES)
  for (let i = 0; i < 5; i++) {
    out[i * 4] = (h[i] >>> 24) & 0xff
    out[i * 4 + 1] = (h[i] >>> 16) & 0xff
    out[i * 4 + 2] = (h[i] >>> 8) & 0xff
    out[i * 4 + 3] = h[i] & 0xff
  }
  return out
}

/** RFC 2104 over SHA-1. Produces the v1 signature. */
export function hmacSha1(key: Uint8Array, data: Uint8Array): Uint8Array {
  const block = new Uint8Array(BLOCK_BYTES)
  // Keys longer than one block are replaced by their digest; shorter keys are zero-padded.
  block.set(key.length > BLOCK_BYTES ? sha1(key) : key)

  const inner = new Uint8Array(BLOCK_BYTES + data.length)
  const outer = new Uint8Array(BLOCK_BYTES + DIGEST_BYTES)
  for (let i = 0; i < BLOCK_BYTES; i++) {
    inner[i] = block[i] ^ 0x36
    outer[i] = block[i] ^ 0x5c
  }
  inner.set(data, BLOCK_BYTES)
  outer.set(sha1(inner), BLOCK_BYTES)
  return sha1(outer)
}
