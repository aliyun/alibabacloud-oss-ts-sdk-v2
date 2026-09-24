import { lookup } from 'mime-types'

/** Looks up an extension in the Node MIME database. */
export function lookupPlatformMimeType(extension: string): string | undefined {
  const value = lookup(extension)
  return value === false ? undefined : value
}
