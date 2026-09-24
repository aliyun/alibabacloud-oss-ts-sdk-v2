import type { HttpTransport, HttpTransportOptions } from '../transport/types.js'
import { createBrowserTransport } from './browser/http.js'

/** The browser half of the swap; `default-transport.ts` states how the three files are selected. */
export function createDefaultTransport(options?: HttpTransportOptions): HttpTransport {
  return createBrowserTransport(options)
}
