import type { HeaderFields } from '../transport/types.js'

/**
 * The canonicalized-header block both signers sign: accepted names sorted, one `name:value\n` line
 * each, every value trimmed. Sorts by name, not by the assembled line.
 */
export function canonicalizedHeaders(fields: HeaderFields, accept: (lower: string) => boolean): string {
  const normalized = fields.toNormalizedRecord()
  const names = Object.keys(normalized)
    .filter(accept)
    .sort()
  let block = ''
  for (const name of names) {
    block += name + ':' + (normalized[name] ?? '').trim() + '\n'
  }
  return block
}
