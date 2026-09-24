import { ParamInvalidError, ParamRequiredError } from '../error/types.js'
import type { ResultModel } from '../models/common.js'
import type { HeaderFields } from '../transport/types.js'
import type { OperationOutput } from '../types.js'
import { lowerCaseKeys } from '../utils/record.js'
import { parseHttpTime } from '../utils/time.js'

const USER_METADATA_PREFIX = 'x-oss-meta-'

export function resultCommon(output: OperationOutput): ResultModel {
  const headers = lowerCaseKeys(output.headers)
  return {
    status: output.status,
    statusCode: output.statusCode,
    requestId: headers['x-oss-request-id'] ?? '',
    headers,
  }
}

/** Collects `x-oss-meta-*` from an already-lowercased header map, prefix removed. */
export function userMetadata(headers: Record<string, string>): Record<string, string> | undefined {
  const metadata: Record<string, string> = {}
  let found = false
  for (const key of Object.keys(headers)) {
    if (!key.startsWith(USER_METADATA_PREFIX)) continue
    const value = headers[key]
    if (value === undefined) continue
    metadata[key.slice(USER_METADATA_PREFIX.length)] = value
    found = true
  }
  return found ? metadata : undefined
}

/** Writes the caller's metadata as `x-oss-meta-*` headers. */
export function applyUserMetadata(headers: HeaderFields, metadata?: Record<string, string>): void {
  if (metadata === undefined) return
  for (const key of Object.keys(metadata)) {
    const value = metadata[key]
    if (value === undefined) continue
    headers.set(USER_METADATA_PREFIX + key, value)
  }
}

/** Returns `undefined` for a missing, blank or non-finite value. */
export function toNumber(value?: string): number | undefined {
  if (value === undefined || value.trim().length === 0) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function toDate(value?: string): Date | undefined {
  return value === undefined ? undefined : parseHttpTime(value)
}

export function toBoolean(value?: string): boolean | undefined {
  return value === undefined ? undefined : value.toLowerCase() === 'true'
}

/** Asserts a required modelled field was supplied. */
export function requireField<T>(value: T | undefined, field: string): T {
  if (value === undefined) throw new ParamRequiredError(field)
  return value
}

/** Query-parameter setters. Parameter names are case-sensitive. */
export function setString(target: Record<string, string>, name: string, value?: string): void {
  if (value !== undefined) target[name] = value
}

export function setNumber(target: Record<string, string>, name: string, value?: number): void {
  if (value === undefined) return
  if (!Number.isFinite(value)) throw new ParamInvalidError(name)
  target[name] = String(value)
}

export function setBoolean(target: Record<string, string>, name: string, value?: boolean): void {
  if (value !== undefined) target[name] = value ? 'true' : 'false'
}

/** The header setters, writing through the case-insensitive `HeaderFields`. */
export function setHeaderString(headers: HeaderFields, name: string, value?: string): void {
  if (value !== undefined) headers.set(name, value)
}

export function setHeaderNumber(headers: HeaderFields, name: string, value?: number): void {
  if (value === undefined) return
  if (!Number.isFinite(value)) throw new ParamInvalidError(name)
  headers.set(name, String(value))
}

export function setHeaderBoolean(headers: HeaderFields, name: string, value?: boolean): void {
  if (value !== undefined) headers.set(name, value ? 'true' : 'false')
}

/** Writes a fixed `Content-Type` when none is set. */
export function setContentTypeIfAbsent(headers: HeaderFields, value: string): void {
  if (headers.get('content-type') !== undefined) return
  headers.set('Content-Type', value)
}

const EMPTY_BODY_CONTENT_MD5 = '1B2M2Y8AsgTpgAmY7PhCfg=='

/**
 * Writes `Content-MD5` unless the bag already carries one under any casing. `value` is the hash of a
 * serializer-built body; the default is the empty-body hash.
 */
export function setDefaultContentMd5(headers: HeaderFields, value = EMPTY_BODY_CONTENT_MD5): void {
  if (headers.get('content-md5') !== undefined) return
  headers.set('Content-MD5', value)
}
