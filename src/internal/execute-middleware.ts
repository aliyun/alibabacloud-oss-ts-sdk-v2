import type { ExecuteContext } from './execute-context.js'
import type { RequestMessage, ResponseMessage } from '../transport/types.js'

/**
 * A link in the HTTP-level chain. A middleware can rewrite headers and the URL. `execute` must not
 * throw synchronously.
 */
export interface ExecuteMiddleware {
  execute(request: RequestMessage, context: ExecuteContext): Promise<ResponseMessage>
}

/** Wraps a middleware around the next one in the chain. */
export type CreateMiddleware = (next: ExecuteMiddleware) => ExecuteMiddleware
