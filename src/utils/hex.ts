const DIGITS = '0123456789abcdef'

/** Lowercase hex, the form v4 signing puts on the wire. */
export function toHex(data: Uint8Array): string {
  let out = ''
  for (let i = 0; i < data.length; i++) {
    out += DIGITS[data[i] >> 4] + DIGITS[data[i] & 15]
  }
  return out
}
