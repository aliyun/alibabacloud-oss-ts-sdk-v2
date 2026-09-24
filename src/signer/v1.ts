import { hasKeys } from '../credentials/types.js'
import type { Credentials } from '../credentials/types.js'
import { ParamInvalidError } from '../error/types.js'
import type { RequestMessage } from '../transport/types.js'
import { toBase64 } from '../utils/base64.js'
import { utf8Encode } from '../utils/bytes.js'
import { canonicalizedHeaders } from '../utils/header.js'
import { hmacSha1 } from '../utils/sha1.js'
import { httpTime } from '../utils/time.js'
import { escapeUriComponent, joinEncodedQuery, parseEncodedQuery, withQuery } from '../utils/uri.js'
import { DEFAULT_EXPIRATION_MS } from './types.js'
import type { Signer, SigningContext } from './types.js'

/** Query parameters OSS always treats as sub-resources. */
const REQUIRED_SIGNED_PARAMETERS = [
  'acl', 'bucketInfo', 'location', 'stat', 'delete', 'append', 'tagging', 'objectMeta',
  'uploads', 'uploadId', 'partNumber', 'security-token', 'position',
  'response-content-type', 'response-content-language', 'response-expires',
  'response-cache-control', 'response-content-disposition', 'response-content-encoding',
  'restore', 'callback', 'callback-var', 'versions', 'versioning', 'versionId',
  'sequential', 'continuation-token', 'regionList', 'cloudboxes', 'symlink',
  'resourceGroup', 'cleanRestoredObject',
]

function parseQuery(url: string): Record<string, string> {
  const out: Record<string, string> = {}
  const at = url.indexOf('?')
  if (at < 0) return out
  for (const segment of url.substring(at + 1).split('&')) {
    if (segment.length === 0) continue
    const eq = segment.indexOf('=')
    const rawKey = eq < 0 ? segment : segment.substring(0, eq)
    const rawValue = eq < 0 ? '' : segment.substring(eq + 1)
    out[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, '%20'))
  }
  return out
}

function isSubResource(name: string, extra?: string[]): boolean {
  if (name.startsWith('x-oss-')) return true
  if (REQUIRED_SIGNED_PARAMETERS.indexOf(name) >= 0) return true
  if (extra !== undefined && extra.indexOf(name) >= 0) return true
  return false
}

/**
 * `dateToSign` is the fourth line: the `Date` header in the header mode, and the absolute expiry in
 * the query mode. Sub-resource names and values are signed decoded, unlike V4.
 */
function buildStringToSign(request: RequestMessage, context: SigningContext, dateToSign: string): string {
  const ossHeaders = canonicalizedHeaders(request.headers, (lower) => lower.startsWith('x-oss-'))

  let resource = '/'
  if (context.bucket !== undefined) resource += context.bucket + '/'
  if (context.key !== undefined) resource += context.key

  const query = parseQuery(request.url)
  const signedNames: string[] = []
  for (const name of Object.keys(query)) {
    if (isSubResource(name, context.subResource)) signedNames.push(name)
  }
  signedNames.sort()
  if (signedNames.length > 0) {
    const parts: string[] = []
    for (const name of signedNames) {
      const value = query[name] ?? ''
      parts.push(value.length > 0 ? name + '=' + value : name)
    }
    resource += '?' + parts.join('&')
  }

  const stringToSign =
    request.method +
    '\n' +
    (request.headers.get('content-md5') ?? '') +
    '\n' +
    (request.headers.get('content-type') ?? '') +
    '\n' +
    dateToSign +
    '\n' +
    ossHeaders +
    resource
  context.stringToSign = stringToSign
  return stringToSign
}

function calculate(secret: string, stringToSign: string): string {
  return toBase64(hmacSha1(utf8Encode(secret), utf8Encode(stringToSign)))
}

function authHeader(request: RequestMessage, context: SigningContext, credentials: Credentials): void {
  const signTime = context.signTime ?? new Date(Date.now() + (context.clockOffset ?? 0))
  context.signTime = signTime
  const dateToSign = httpTime(signTime)
  context.dateToSign = dateToSign
  request.headers.set('Date', dateToSign)
  if (credentials.securityToken !== undefined && credentials.securityToken.length > 0) {
    request.headers.set('x-oss-security-token', credentials.securityToken)
  }

  const signature = calculate(credentials.accessKeySecret, buildStringToSign(request, context, dateToSign))
  request.headers.set('Authorization', 'OSS ' + credentials.accessKeyId + ':' + signature)
}

function authQuery(request: RequestMessage, context: SigningContext, credentials: Credentials): void {
  const signTime = context.signTime ?? new Date(Date.now() + (context.clockOffset ?? 0))
  context.signTime = signTime
  const expiration = context.expirationTime ?? new Date(signTime.getTime() + DEFAULT_EXPIRATION_MS)
  context.expirationTime = expiration
  // Absolute seconds, where V4 signs a span.
  const dateToSign = String(Math.floor(expiration.getTime() / 1000))
  context.dateToSign = dateToSign

  const query = parseEncodedQuery(request.url)
  // `security-token` is signed; the three parameters added below are not.
  if (credentials.securityToken !== undefined && credentials.securityToken.length > 0) {
    query['security-token'] = escapeUriComponent(credentials.securityToken)
    request.url = withQuery(request.url, joinEncodedQuery(query))
  }

  const signature = calculate(credentials.accessKeySecret, buildStringToSign(request, context, dateToSign))
  query['Expires'] = dateToSign
  query['OSSAccessKeyId'] = escapeUriComponent(credentials.accessKeyId)
  query['Signature'] = escapeUriComponent(signature)
  request.url = withQuery(request.url, joinEncodedQuery(query))
}

/** V1 signing, in whichever of the two auth modes `context.authHeader` selects. */
export class SignerV1 implements Signer {
  sign(request: RequestMessage, context: SigningContext): Promise<void> {
    const credentials = context.credentials
    if (credentials === undefined || !hasKeys(credentials)) {
      return Promise.reject(new ParamInvalidError('SigningContext.credentials'))
    }

    if (context.authHeader) authHeader(request, context, credentials)
    else authQuery(request, context, credentials)
    return Promise.resolve()
  }
}
