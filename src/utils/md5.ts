const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

/** RFC 1321's T table. */
const SINES = new Uint32Array(64)
for (let i = 0; i < 64; i++) {
  SINES[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)
}

/** RFC 1321 MD5. */
export function md5(data: Uint8Array): Uint8Array {
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64)
  padded.set(data)
  padded[data.length] = 0x80

  const bits = data.length * 8
  const low = bits % 4294967296
  const high = Math.floor(bits / 4294967296)
  const lengthAt = padded.length - 8
  padded[lengthAt] = low & 0xff
  padded[lengthAt + 1] = (low >>> 8) & 0xff
  padded[lengthAt + 2] = (low >>> 16) & 0xff
  padded[lengthAt + 3] = (low >>> 24) & 0xff
  padded[lengthAt + 4] = high & 0xff
  padded[lengthAt + 5] = (high >>> 8) & 0xff
  padded[lengthAt + 6] = (high >>> 16) & 0xff
  padded[lengthAt + 7] = (high >>> 24) & 0xff

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  const words = new Uint32Array(16)

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let j = 0; j < 16; j++) {
      const at = offset + j * 4
      words[j] = (padded[at] | (padded[at + 1] << 8) | (padded[at + 2] << 16) | (padded[at + 3] << 24)) >>> 0
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    for (let i = 0; i < 64; i++) {
      let f = 0
      let g = 0
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      const sum = (f + a + SINES[i] + words[g]) >>> 0
      const shift = SHIFTS[i]
      a = d
      d = c
      c = b
      b = (b + (((sum << shift) | (sum >>> (32 - shift))) >>> 0)) >>> 0
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
  }

  const out = new Uint8Array(16)
  const state = [h0, h1, h2, h3]
  for (let i = 0; i < 4; i++) {
    out[i * 4] = state[i] & 0xff
    out[i * 4 + 1] = (state[i] >>> 8) & 0xff
    out[i * 4 + 2] = (state[i] >>> 16) & 0xff
    out[i * 4 + 3] = (state[i] >>> 24) & 0xff
  }
  return out
}
