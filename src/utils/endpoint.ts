/** Which family of hostnames to derive from a region. */
export type EndpointType = 'public' | 'internal' | 'dualstack' | 'accelerate'

/** An endpoint split into the parts the URL builder and the addressing rules need. */
export interface ParsedEndpoint {
  /** `http` or `https`. */
  scheme: string
  /** Host as written, port and IPv6 brackets included. Goes into the URL. */
  host: string
  /** Host without port or brackets. Used only to decide whether the endpoint is an IP. */
  hostname: string
}

const CHAR_SPACE = 0x20
const CHAR_AT = 0x40
const CHAR_DEL = 0x7f

function hasInvalidHostChar(host: string): boolean {
  for (let i = 0; i < host.length; i += 1) {
    const c = host.charCodeAt(i)
    // Control characters and space are typos; `@` means someone put credentials in the endpoint.
    if (c <= CHAR_SPACE || c === CHAR_AT || c === CHAR_DEL) return true
  }
  return false
}

function hostnameOf(host: string): string {
  if (host.startsWith('[')) {
    const close = host.indexOf(']')
    // An unterminated bracket has no hostname in it; the caller rejects the empty result.
    return close < 0 ? '' : host.slice(1, close)
  }
  const colon = host.indexOf(':')
  return colon < 0 ? host : host.slice(0, colon)
}

/**
 * Parses an endpoint, returning `undefined` for anything unusable so the caller can raise a config
 * error rather than address a nonsense host.
 */
export function parseEndpoint(endpoint: string, defaultScheme: string): ParsedEndpoint | undefined {
  const trimmed = endpoint.trim()
  if (trimmed.length === 0) return undefined

  let scheme = defaultScheme
  let rest = trimmed
  const separator = trimmed.indexOf('://')
  if (separator >= 0) {
    scheme = trimmed.slice(0, separator).toLowerCase()
    rest = trimmed.slice(separator + 3)
  }
  if (scheme !== 'http' && scheme !== 'https') return undefined

  let end = rest.length
  const marks = ['/', '?', '#']
  for (const mark of marks) {
    const at = rest.indexOf(mark)
    if (at >= 0 && at < end) end = at
  }

  const host = rest.slice(0, end)
  if (hasInvalidHostChar(host)) return undefined

  const hostname = hostnameOf(host)
  if (hostname.length === 0) return undefined

  return { scheme, host, hostname }
}

/** The default endpoint for a region, `<scheme>://<host>` with no path. */
export function endpointFromRegion(region: string, type: EndpointType, scheme: string): string {
  let host: string
  switch (type) {
    case 'internal':
      host = 'oss-' + region + '-internal.aliyuncs.com'
      break
    case 'dualstack':
      host = region + '.oss.aliyuncs.com'
      break
    case 'accelerate':
      host = 'oss-accelerate.aliyuncs.com'
      break
    default:
      host = 'oss-' + region + '.aliyuncs.com'
      break
  }
  return scheme + '://' + host
}
