/** Browsers expose no MIME database lookup API. */
export function lookupPlatformMimeType(_extension: string): string | undefined {
  return undefined
}
