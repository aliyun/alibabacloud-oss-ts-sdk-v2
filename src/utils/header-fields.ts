import type { HeaderFields } from '../transport/types.js'

/** One stored field: the value under its original spelling. */
interface HeaderEntry {
  name: string
  value: string
}

class HeaderFieldsImpl implements HeaderFields {
  private readonly map = new Map<string, HeaderEntry>()

  get(name: string): string | undefined {
    return this.map.get(name.toLowerCase())?.value
  }

  set(name: string, value: string): void {
    // Keyed by lowercase; the latest write sets both the value and its wire spelling.
    this.map.set(name.toLowerCase(), { name, value })
  }

  toRecord(): Record<string, string> {
    const out: Record<string, string> = {}
    this.map.forEach((entry) => {
      out[entry.name] = entry.value
    })
    return out
  }

  toNormalizedRecord(): Record<string, string> {
    const out: Record<string, string> = {}
    this.map.forEach((entry, lower) => {
      out[lower] = entry.value
    })
    return out
  }
}

/** Builds a fresh `HeaderFields`, copied from a record's own spellings. */
export function createHeaderFields(init?: Record<string, string>): HeaderFields {
  const fields = new HeaderFieldsImpl()
  if (init === undefined) return fields
  for (const name of Object.keys(init)) {
    const value = init[name]
    if (value !== undefined) fields.set(name, value)
  }
  return fields
}

/** True when `headers` is a built `HeaderFields` rather than a plain record. */
export function isHeaderFields(headers?: Record<string, string> | HeaderFields): headers is HeaderFields {
  return typeof (headers as HeaderFields | undefined)?.toRecord === 'function'
}
