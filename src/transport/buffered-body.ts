import type { ResponseBody, StreamLike } from './types.js'
import { utf8Decode } from '../utils/bytes.js'

/** A replayable `ResponseBody` over bytes already buffered in memory. */
export function bufferedBody(bytes: Uint8Array): ResponseBody {
  return {
    bytes: (): Promise<Uint8Array> => Promise.resolve(bytes),
    text: (): Promise<string> => Promise.resolve(utf8Decode(bytes)),
    // Each call returns a reader over the full body.
    stream: (): StreamLike => {
      let sent = bytes.byteLength === 0
      return {
        read: (): Promise<Uint8Array | null> => {
          if (sent) return Promise.resolve(null)
          sent = true
          return Promise.resolve(bytes)
        },
      }
    },
  }
}

/** `true` only when the caller asked to stream and the status is 2xx without 203. */
export function allowsStreaming(responseStream: boolean | undefined, statusCode: number): boolean {
  return responseStream === true && statusCode >= 200 && statusCode < 300 && statusCode !== 203
}
