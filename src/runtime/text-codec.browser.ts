// Browser UTF-8 codec backed by native globals.
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { ignoreBOM: true })

/** Encodes a string as UTF-8. */
export function utf8Encode(input: string): Uint8Array {
  return encoder.encode(input)
}

/** Decodes UTF-8 bytes. */
export function utf8Decode(input: Uint8Array): string {
  return decoder.decode(input)
}
