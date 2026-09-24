import type { OperationInput } from '../../src/types.js'
import { isHeaderFields } from '../../src/utils/header-fields.js'

/**
 * Reads a serialized input's headers as a plain record, whichever shape it carries: a serializer now
 * hands back a `HeaderFields`, but a bodyless operation may still leave headers unset.
 */
export function headersOf(input: OperationInput): Record<string, string> {
  const headers = input.headers
  if (headers === undefined) return {}
  return isHeaderFields(headers) ? headers.toRecord() : headers
}
