/** What a platform HTTP module may hand back as a header map. */
export type RawHeaders = Record<string, string | string[] | number | undefined>

/** Normalizes a platform header map to a lowercased `Record<string, string>`. */
export function normalizeHeaders(raw: RawHeaders): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const name of Object.keys(raw)) {
    const value = raw[name]
    if (value === undefined) continue
    const lower = name.toLowerCase()
    if (typeof value === 'string') headers[lower] = value
    else if (typeof value === 'number') headers[lower] = String(value)
    else headers[lower] = value.join(', ')
  }
  return headers
}
