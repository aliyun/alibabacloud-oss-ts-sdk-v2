// Default UTF-8 codec backed by the runtime globals.
interface Utf8Encoder {
  encode(input: string): Uint8Array
}
interface Utf8Decoder {
  decode(input: Uint8Array): string
}
interface CodecGlobals {
  TextEncoder: new () => Utf8Encoder
  TextDecoder: new (label: string, options: { ignoreBOM: boolean }) => Utf8Decoder
}

const codec = globalThis as unknown as CodecGlobals
const encoder = new codec.TextEncoder()
const decoder = new codec.TextDecoder('utf-8', { ignoreBOM: true })

/** Encodes a string as UTF-8. */
export function utf8Encode(input: string): Uint8Array {
  return encoder.encode(input)
}

/** Decodes UTF-8 bytes. */
export function utf8Decode(input: Uint8Array): string {
  return decoder.decode(input)
}
