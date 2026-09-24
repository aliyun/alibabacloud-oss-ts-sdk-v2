import type { ExecuteContext } from './execute-context.js'
import { toServiceError } from '../error/service.js'
import type { Logger } from '../log/logger.js'
import type { RequestMessage, ResponseMessage } from '../transport/types.js'
import type { ExecuteMiddleware } from './execute-middleware.js'

/** Turns a non-2xx response into a `ServiceError` and fires the caller's response handlers. */
export class ResponseCheckerMiddleware implements ExecuteMiddleware {
  private readonly next: ExecuteMiddleware
  private readonly logger?: Logger

  constructor(next: ExecuteMiddleware, logger?: Logger) {
    this.next = next
    this.logger = logger
  }

  /**
   * Checks status before running handlers. Handlers run only for 2xx responses, including 203, and a
   * handler that throws fails the request.
   */
  async execute(request: RequestMessage, context: ExecuteContext): Promise<ResponseMessage> {
    const response = await this.next.execute(request, context)

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const requestTarget = request.method + ' ' + request.url
      this.logger?.debug('Non-2xx response for ' + requestTarget + ': ' + String(response.statusCode))
      throw await toServiceError(response, requestTarget)
    }

    const handlers = context.responseHandlers
    if (handlers !== undefined) {
      for (const handler of handlers) {
        handler(response.statusCode, response.headers)
      }
    }

    return response
  }
}
