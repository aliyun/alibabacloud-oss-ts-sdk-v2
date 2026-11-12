import type { RequestMessage } from '../transport/types.js'

/** The content type `@ohos.net.http` writes when a PUT, POST, or DELETE omits one. */
const NETSTACK_DEFAULT_CONTENT_TYPE = 'application/json'

/**
 * `@ohos.net.http` replaces a missing Content-Type with `application/json` on PUT, POST, and DELETE.
 * An empty value is dropped and then replaced the same way, so the type that will be sent has to be
 * written here, before the signer reads the headers.
 */
export function tuneRequestForSigning(request: RequestMessage): void {
  const method = request.method
  if (method !== 'POST' && method !== 'PUT' && method !== 'DELETE') return
  if (request.headers.get('content-type') !== undefined) return
  request.headers.set('Content-Type', NETSTACK_DEFAULT_CONTENT_TYPE)
}
