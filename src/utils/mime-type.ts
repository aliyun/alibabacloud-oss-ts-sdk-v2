import { lookupPlatformMimeType } from '../runtime/mime-type.js'

export type MimeTypeMappings = Readonly<Record<string, string>>

const userMimeTypes: Record<string, string> = {}

const builtinMimeTypes: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.css': 'text/css',
  '.gif': 'image/gif',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mjs': 'text/javascript',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.xml': 'text/xml',
}

function normalizeExtension(extension: string): string | undefined {
  if (extension.length === 0) return undefined
  const normalized = extension.toLowerCase()
  return normalized.startsWith('.') ? normalized : '.' + normalized
}

function extensionOf(name: string): string | undefined {
  const separator = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'))
  const dot = name.lastIndexOf('.')
  if (dot <= separator || dot === name.length - 1) return undefined
  return name.slice(dot).toLowerCase()
}

/** Adds extension-to-MIME mappings to the global user table. */
export function addMimeType(mappings: MimeTypeMappings): void {
  for (const extension of Object.keys(mappings)) {
    const normalized = normalizeExtension(extension)
    if (normalized !== undefined) userMimeTypes[normalized] = mappings[extension]
  }
}

/** Looks up the MIME type for a file or object name. */
export function lookupMimeType(name: string, defaultType?: string): string | undefined {
  const extension = extensionOf(name)
  if (extension === undefined) return defaultType
  return userMimeTypes[extension] ?? lookupPlatformMimeType(extension) ?? builtinMimeTypes[extension] ?? defaultType
}
