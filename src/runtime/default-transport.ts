import type { HttpTransport, HttpTransportOptions } from '../transport/types.js'
import { createNodeTransport } from './node/http.js'

/** Creates the default Node transport. */
export function createDefaultTransport(options?: HttpTransportOptions): HttpTransport {
  return createNodeTransport(options)
}
