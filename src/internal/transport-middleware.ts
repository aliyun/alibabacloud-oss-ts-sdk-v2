import { throwIfAborted } from '../utils/abort.js'
import { ParamRequiredError } from '../error/types.js'
import type { ExecuteContext } from './execute-context.js'
import type { RequestMessage, ResponseMessage, HttpTransport } from '../transport/types.js'
import type { ExecuteMiddleware } from './execute-middleware.js'

export const missingTransport: HttpTransport = {
  send: () => Promise.reject(new ParamRequiredError('Config.transport')),
}

/** The terminal middleware and the only one that touches the platform. */
export class TransportMiddleware implements ExecuteMiddleware {
  private readonly transport: HttpTransport

  constructor(transport: HttpTransport) {
    this.transport = transport
  }

  async execute(request: RequestMessage, context: ExecuteContext): Promise<ResponseMessage> {
    throwIfAborted(context.signal)
    return await this.transport.send(request, {
      readWriteTimeoutMs: context.readWriteTimeoutMs,
      progressReporter: context.progressObserver?.feed,
      signal: context.signal,
      responseStream: context.responseStream,
    })
  }
}
