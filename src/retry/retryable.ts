import {
  CanceledError,
  CredentialsError,
  MAX_CAUSE_DEPTH,
  OssError,
  RequestError,
  ServiceError,
} from '../error/types.js'
import type { ErrorRetryable } from './types.js'

const RETRYABLE_STATUS_CODES_BELOW_500 = [401, 408, 429]

const RETRYABLE_SERVICE_ERROR_CODES = ['RequestTimeTooSkewed', 'BadRequest']

/** Retries on the response status: any 5xx, plus 401, 408 and 429. */
export class HttpStatusCodeRetryable implements ErrorRetryable {
  isErrorRetryable(error: Error): boolean {
    if (!(error instanceof ServiceError)) return false
    if (error.statusCode >= 500) return true
    return RETRYABLE_STATUS_CODES_BELOW_500.indexOf(error.statusCode) >= 0
  }
}

/** Retries on the server's error code, whatever status carried it. */
export class ServiceErrorCodeRetryable implements ErrorRetryable {
  isErrorRetryable(error: Error): boolean {
    if (!(error instanceof ServiceError)) return false
    return RETRYABLE_SERVICE_ERROR_CODES.indexOf(error.code) >= 0
  }
}

/** Retries incomplete transport or credentials-provider failures unless the cause chain was canceled. */
export class ClientErrorRetryable implements ErrorRetryable {
  isErrorRetryable(error: Error): boolean {
    const chain: Error[] = []
    let next: Error | undefined = error
    while (next !== undefined && chain.length < MAX_CAUSE_DEPTH) {
      if (next instanceof CanceledError) return false
      if (chain.indexOf(next) >= 0) break
      chain.push(next)
      const parent: Error | undefined = next instanceof OssError ? next.cause : undefined
      next = parent instanceof Error ? parent : undefined
    }

    for (const link of chain) {
      if (link instanceof RequestError || link instanceof CredentialsError) return true
    }
    return false
  }
}

/** What the default retryer consults, in order. */
export const DEFAULT_ERROR_RETRYABLES: readonly ErrorRetryable[] = [
  new HttpStatusCodeRetryable(),
  new ServiceErrorCodeRetryable(),
  new ClientErrorRetryable(),
]
