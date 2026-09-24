import type { AbortSignalLike } from '../utils/abort.js'
import type { SigningContext } from '../signer/types.js'
import type { ResponseHandler } from '../types.js'
import type { ProgressObserver } from './progress.js'

/**
 * Shared state between the middlewares. The signer may set `signTime`, and the retryer may set
 * `clockOffset`. A retry may clear only a signer-provided `signTime`; all other fields are read-only
 * after the chain starts.
 */
export interface ExecuteContext {
  retryMaxAttempts?: number
  readWriteTimeoutMs?: number
  /** What the signer signs with, and where the retryer records a clock correction. Required. */
  signingContext: SigningContext
  /** The caller's progress callback and retry progress state. */
  progressObserver?: ProgressObserver
  /** Observers called for successful response status codes and headers. */
  responseHandlers?: readonly ResponseHandler[]
  signal?: AbortSignalLike
  /** Resolved from the operation metadata `response-stream`; only `true` responses stream. */
  responseStream?: boolean
}
