// Re-export the platform-selected UTF-8 codec.
export { utf8Decode, utf8Encode } from '../runtime/text-codec.js'

/** Joins the parts into one new array. */
export function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
