// OpenHarmony UTF-8 codec backed by `@ohos.util`.
import util from '@ohos.util'

/** Options `TextDecoder.create` accepts; only `ignoreBOM` is set here. */
export interface HarmonyTextDecoderOptions {
  ignoreBOM: boolean
}
/** The one decoder method this module calls. */
export interface HarmonyTextDecoder {
  decodeToString(input: Uint8Array): string
}
/** The one encoder method this module calls. */
export interface HarmonyTextEncoder {
  encodeInto(input: string): Uint8Array
}
/** `util.TextDecoder`, reached through its static factory. */
export interface HarmonyTextDecoderCtor {
  create(encoding: string, options: HarmonyTextDecoderOptions): HarmonyTextDecoder
}
/** `util.TextEncoder`, reached through its static factory. */
export interface HarmonyTextEncoderCtor {
  create(encoding: string): HarmonyTextEncoder
}
/** The subset of `@ohos.util` this module uses. */
export interface HarmonyUtil {
  TextDecoder: HarmonyTextDecoderCtor
  TextEncoder: HarmonyTextEncoderCtor
}

const encoder = util.TextEncoder.create('utf-8')
const decoder = util.TextDecoder.create('utf-8', { ignoreBOM: true })

/** Encodes a string as UTF-8. */
export function utf8Encode(input: string): Uint8Array {
  // `encodeInto('')` returns undefined on device.
  if (input.length === 0) return new Uint8Array(0)
  return encoder.encodeInto(input)
}

/** Decodes UTF-8 bytes. */
export function utf8Decode(input: Uint8Array): string {
  // Empty input returns undefined on device.
  if (input.length === 0) return ''
  return decoder.decodeToString(input)
}
