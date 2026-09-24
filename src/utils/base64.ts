const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function toBase64(data: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < data.length; i += 3) {
    const v = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
    out += ALPHABET[(v >> 18) & 63] + ALPHABET[(v >> 12) & 63] + ALPHABET[(v >> 6) & 63] + ALPHABET[v & 63]
  }
  const rest = data.length - i
  if (rest === 1) {
    const v = data[i] << 16
    out += ALPHABET[(v >> 18) & 63] + ALPHABET[(v >> 12) & 63] + '=='
  } else if (rest === 2) {
    const v = (data[i] << 16) | (data[i + 1] << 8)
    out += ALPHABET[(v >> 18) & 63] + ALPHABET[(v >> 12) & 63] + ALPHABET[(v >> 6) & 63] + '='
  }
  return out
}

function decodeChar(c: string, index: number): number {
  const at = ALPHABET.indexOf(c)
  if (at < 0) {
    const cp = c.codePointAt(0) ?? 0
    throw new Error('invalid base64 character: U+' + cp.toString(16).toUpperCase().padStart(4, '0') + ' at index ' + String(index))
  }
  return at
}

export function fromBase64(text: string): Uint8Array {
  // Whitespace and `=` are ignored wherever they appear.
  const sextets: number[] = []
  for (let index = 0; index < text.length; index++) {
    const c = text[index]
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') continue
    if (c === '=') continue
    sextets.push(decodeChar(c, index))
  }
  // A trailing group of one significant character is invalid.
  if (sextets.length % 4 === 1) {
    throw new Error('invalid base64 length: ' + String(sextets.length) + ' significant characters')
  }
  const out: number[] = []
  for (let i = 0; i < sextets.length; i += 4) {
    const n = Math.min(4, sextets.length - i)
    let v = 0
    for (let j = 0; j < 4; j++) {
      v = (v << 6) | (j < n ? sextets[i + j] : 0)
    }
    out.push((v >> 16) & 0xff)
    if (n > 2) out.push((v >> 8) & 0xff)
    if (n > 3) out.push(v & 0xff)
  }
  return new Uint8Array(out)
}
