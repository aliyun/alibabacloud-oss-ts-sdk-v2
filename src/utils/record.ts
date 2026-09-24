/** A shallow copy of a data object. */
export function shallowClone<T extends object>(src: T): T {
  const out = {} as T
  for (const key of Object.keys(src) as (keyof T)[]) out[key] = src[key]
  return out
}

/** Copies `src` into `dst`, overwriting on a key collision. */
export function copyInto(dst: Record<string, string>, src?: Record<string, string>): void {
  if (src === undefined) return
  for (const key of Object.keys(src)) {
    const value = src[key]
    if (value === undefined) continue
    dst[key] = value
  }
}

/** A copy with every key lowercased, for reading a header record case-insensitively. */
export function lowerCaseKeys(src: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(src)) {
    const value = src[key]
    if (value === undefined) continue
    out[key.toLowerCase()] = value
  }
  return out
}
