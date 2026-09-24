const CHAR_LOWER_A = 0x61
const CHAR_LOWER_Z = 0x7a
const CHAR_ZERO = 0x30
const CHAR_NINE = 0x39
const CHAR_HYPHEN = 0x2d
const MAX_OCTET = 255

function isLowerAlphanumericOrHyphen(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i)
    const ok = (c >= CHAR_LOWER_A && c <= CHAR_LOWER_Z) || (c >= CHAR_ZERO && c <= CHAR_NINE) || c === CHAR_HYPHEN
    if (!ok) return false
  }
  return true
}

/** Whether the region is non-empty lowercase letters, digits and hyphens. */
export function isValidRegion(region: string): boolean {
  return region.length > 0 && isLowerAlphanumericOrHyphen(region)
}

/** Whether the bucket name is 3..63 lowercase letters, digits and hyphens, not hyphen-terminated. */
export function isValidBucketName(bucketName?: string): boolean {
  if (bucketName === undefined) return false
  const length = bucketName.length
  if (length < 3 || length > 63) return false
  if (bucketName.charCodeAt(0) === CHAR_HYPHEN) return false
  if (bucketName.charCodeAt(length - 1) === CHAR_HYPHEN) return false
  return isLowerAlphanumericOrHyphen(bucketName)
}

/** A non-empty key of at most 1024 UTF-16 code units. */
export function isValidObjectName(objectName?: string): boolean {
  return objectName !== undefined && objectName.length > 0 && objectName.length <= 1024
}

/** Reports whether the hostname is an IP literal. Expects IPv6 brackets and the port to be stripped. */
export function isIpAddress(hostname: string): boolean {
  if (hostname.indexOf(':') >= 0) return true

  const parts = hostname.split('.')
  if (parts.length !== 4) return false
  for (const part of parts) {
    if (part.length === 0) return false
    for (let i = 0; i < part.length; i += 1) {
      const c = part.charCodeAt(i)
      if (c < CHAR_ZERO || c > CHAR_NINE) return false
    }
    if (Number(part) > MAX_OCTET) return false
  }
  return true
}
