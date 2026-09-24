import { hasKeys } from '../credentials/types.js'
import type { Credentials } from '../credentials/types.js'
import { ParamInvalidError } from '../error/types.js'
import type { RequestMessage } from '../transport/types.js'
import { utf8Encode } from '../utils/bytes.js'
import { canonicalizedHeaders } from '../utils/header.js'
import { toHex } from '../utils/hex.js'
import { hmacSha256, sha256 } from '../utils/sha256.js'
import { httpTime, iso8601Date, iso8601Datetime } from '../utils/time.js'
import { escapePath, escapeUriComponent, joinEncodedQuery, parseEncodedQuery, withQuery } from '../utils/uri.js'
import { DEFAULT_EXPIRATION_MS, isDefaultSignedHeader } from './types.js'
import type { Signer, SigningContext } from './types.js'

const ALGORITHM = 'OSS4-HMAC-SHA256'
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD'
const TERMINATOR = 'aliyun_v4_request'

/** The scope the signature is derived under, and the two renderings of the signing instant. */
interface Scope {
  datetime: string
  date: string
  region: string
  product: string
  scope: string
}

function signingScope(context: SigningContext, signTime: Date): Scope {
  const date = iso8601Date(signTime)
  const product = context.product ?? 'oss'
  const region = context.region ?? ''
  return {
    datetime: iso8601Datetime(signTime),
    date,
    region,
    product,
    scope: date + '/' + region + '/' + product + '/' + TERMINATOR,
  }
}

/** The requested additional headers that are present on the request and not already signed. */
function signedAdditionalHeaders(request: RequestMessage, context: SigningContext): string[] {
  const additional: string[] = []
  for (const name of context.additionalHeaderNames ?? []) {
    const lower = name.toLowerCase()
    if (isDefaultSignedHeader(lower)) continue
    // A header that is present but empty is not carried into AdditionalHeaders.
    if ((request.headers.get(lower) ?? '').length === 0) continue
    if (additional.indexOf(lower) < 0) additional.push(lower)
  }
  additional.sort()
  context.additionalHeadersToSign = additional.join(';')
  return additional
}

/** Signs `query` in encoded form, sorted by encoded key. */
function buildCanonicalRequest(
  request: RequestMessage,
  context: SigningContext,
  query: Record<string, string>,
  additional: string[],
): string {
  const canonicalHeaders = canonicalizedHeaders(
    request.headers,
    (lower) => isDefaultSignedHeader(lower) || additional.indexOf(lower) >= 0,
  )

  let uri = '/'
  if (context.bucket !== undefined) uri += context.bucket + '/'
  if (context.key !== undefined) uri += context.key

  // `canonicalHeaders` already ends in `\n`, so a request with no additional headers carries three
  // consecutive newlines before the payload.
  const canonicalRequest =
    request.method +
    '\n' +
    escapePath(uri, false) +
    '\n' +
    joinEncodedQuery(query) +
    '\n' +
    canonicalHeaders +
    '\n' +
    context.additionalHeadersToSign +
    '\n' +
    UNSIGNED_PAYLOAD
  context.canonicalRequest = canonicalRequest
  return canonicalRequest
}

function buildStringToSign(context: SigningContext, scope: Scope, canonicalRequest: string): string {
  const hashed = toHex(sha256(utf8Encode(canonicalRequest)))
  const stringToSign = ALGORITHM + '\n' + scope.datetime + '\n' + scope.scope + '\n' + hashed
  context.dateToSign = scope.date
  context.scopeToSign = scope.scope
  context.stringToSign = stringToSign
  return stringToSign
}

function buildSignature(secret: string, scope: Scope, stringToSign: string): string {
  // The four derivation steps follow the order in `Scope.scope`.
  let key = hmacSha256(utf8Encode('aliyun_v4' + secret), utf8Encode(scope.date))
  key = hmacSha256(key, utf8Encode(scope.region))
  key = hmacSha256(key, utf8Encode(scope.product))
  key = hmacSha256(key, utf8Encode(TERMINATOR))
  return toHex(hmacSha256(key, utf8Encode(stringToSign)))
}

function authHeader(request: RequestMessage, context: SigningContext, credentials: Credentials): void {
  const signTime = context.signTime ?? new Date(Date.now() + (context.clockOffset ?? 0))
  context.signTime = signTime
  const scope = signingScope(context, signTime)

  // `Date` is not signed; `x-oss-date` carries the signed instant.
  request.headers.set('x-oss-date', scope.datetime)
  request.headers.set('Date', httpTime(signTime))
  request.headers.set('x-oss-content-sha256', UNSIGNED_PAYLOAD)
  if (credentials.securityToken !== undefined && credentials.securityToken.length > 0) {
    request.headers.set('x-oss-security-token', credentials.securityToken)
  }

  const additional = signedAdditionalHeaders(request, context)
  const canonicalRequest = buildCanonicalRequest(request, context, parseEncodedQuery(request.url), additional)
  const stringToSign = buildStringToSign(context, scope, canonicalRequest)
  const signature = buildSignature(credentials.accessKeySecret, scope, stringToSign)

  let authorization = ALGORITHM + ' Credential=' + credentials.accessKeyId + '/' + scope.scope
  // Empty `AdditionalHeaders` is omitted.
  if (context.additionalHeadersToSign.length > 0) {
    authorization += ',AdditionalHeaders=' + context.additionalHeadersToSign
  }
  authorization += ',Signature=' + signature
  request.headers.set('Authorization', authorization)
}

function authQuery(request: RequestMessage, context: SigningContext, credentials: Credentials): void {
  const signTime = context.signTime ?? new Date(Date.now() + (context.clockOffset ?? 0))
  context.signTime = signTime
  const scope = signingScope(context, signTime)
  const expiration = context.expirationTime ?? new Date(signTime.getTime() + DEFAULT_EXPIRATION_MS)
  context.expirationTime = expiration

  const additional = signedAdditionalHeaders(request, context)
  const parsed = parseEncodedQuery(request.url)
  const query: Record<string, string> = {}
  for (const key of Object.keys(parsed)) {
    if (key !== 'x-oss-signature') query[key] = parsed[key] ?? ''
  }
  query['x-oss-signature-version'] = ALGORITHM
  query['x-oss-date'] = scope.datetime
  // A span of seconds rather than an instant: the server adds it to `x-oss-date`.
  query['x-oss-expires'] = String(Math.floor((expiration.getTime() - signTime.getTime()) / 1000))
  query['x-oss-credential'] = escapeUriComponent(credentials.accessKeyId + '/' + scope.scope)
  if (credentials.securityToken !== undefined && credentials.securityToken.length > 0) {
    query['x-oss-security-token'] = escapeUriComponent(credentials.securityToken)
  }
  if (context.additionalHeadersToSign.length > 0) {
    query['x-oss-additional-headers'] = escapeUriComponent(context.additionalHeadersToSign)
  }
  const canonicalRequest = buildCanonicalRequest(request, context, query, additional)
  const stringToSign = buildStringToSign(context, scope, canonicalRequest)
  query['x-oss-signature'] = escapeUriComponent(buildSignature(credentials.accessKeySecret, scope, stringToSign))
  request.url = withQuery(request.url, joinEncodedQuery(query))
}

/** V4 signing, in whichever of the two auth modes `context.authHeader` selects. */
export class SignerV4 implements Signer {
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
