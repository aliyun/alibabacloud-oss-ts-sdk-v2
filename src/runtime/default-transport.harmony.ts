import type { HttpTransport, HttpTransportOptions } from '../transport/types.js'
import { createHarmonyTransport } from './harmony/http.js'

/** The OpenHarmony half of the swap; `default-transport.ts` states how the three files are selected. */
export function createDefaultTransport(options?: HttpTransportOptions): HttpTransport {
  return createHarmonyTransport(options)
}
