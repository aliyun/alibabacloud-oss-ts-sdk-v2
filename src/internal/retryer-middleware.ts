import { raceAbort, throwIfAborted } from '../utils/abort.js'
import type { ExecuteContext } from './execute-context.js'
import { CanceledError, OssError, ServiceError } from '../error/types.js'
import type { Logger } from '../log/logger.js'
import type { Retryer } from '../retry/types.js'
import { sleep } from '../utils/sleep.js'
import type { RequestMessage, ResponseMessage } from '../transport/types.js'
import type { ExecuteMiddleware } from './execute-middleware.js'

/**
 * Retries the chain below it. Attempts are numbered from 1. Replayable bodies are re-read by the
 * transport, while a one-shot body prevents a second attempt.
 */
export class RetryerMiddleware implements ExecuteMiddleware {
  private readonly next: ExecuteMiddleware
  private readonly retryer: Retryer
  private readonly logger?: Logger

  constructor(next: ExecuteMiddleware, retryer: Retryer, logger?: Logger) {
    this.next = next
    this.retryer = retryer
    this.logger = logger
  }

  async execute(request: RequestMessage, context: ExecuteContext): Promise<ResponseMessage> {
    // Non-positive or NaN values allow one attempt.
    const requested = context.retryMaxAttempts ?? this.retryer.maxAttempts()
    const maxAttempts = requested > 0 ? requested : 1
    const signingContext = context.signingContext
    const resetSignTime = signingContext.signTime === undefined
    let lastError: Error = new OssError('the retry loop made no attempt')

    for (let tries = 1; tries <= maxAttempts; tries += 1) {
      if (tries > 1) {
        const delayMs = this.retryer.retryDelay(tries, lastError)
        this.logger?.info(
          'Attempt retry, tries: ' + String(tries) + ', delay: ' + String(delayMs) + 'ms, error: ' + lastError.message,
        )
        await this.wait(delayMs, context)
        if (resetSignTime) signingContext.signTime = undefined
        // Reset progress accounting before replay.
        context.progressObserver?.reset()
      }

      throwIfAborted(context.signal)
      try {
        return await this.next.execute(request, context)
      } catch (err) {
        const error =
          err instanceof Error ? err : new OssError('the middleware chain threw a value that was not an Error')
        // Cancellations are terminal.
        if (error instanceof CanceledError) throw error
        this.correctClockSkew(context, error)
        lastError = error
        // One-shot bodies are not retried.
        if (request.body?.oneShot === true) throw error
        if (!this.retryer.isErrorRetryable(error)) throw error
      }
    }

    throw lastError
  }

  /** Waits with abort support. */
  private wait(delayMs: number, context: ExecuteContext): Promise<void> {
    const sleeping = sleep(delayMs)
    return context.signal === undefined ? sleeping : raceAbort(sleeping, context.signal)
  }

  /**
   * Records the offset between the server response `Date` and the signing time for the next attempt.
   * A missing or unparseable timestamp does not update the offset.
   */
  private correctClockSkew(context: ExecuteContext, error: Error): void {
    if (!(error instanceof ServiceError)) return
    if (error.code !== 'RequestTimeTooSkewed') return
    const serverTime = error.timestamp
    if (serverTime === undefined) return
    const signingContext = context.signingContext
    const signTime = signingContext.signTime
    if (signTime === undefined) return
    signingContext.clockOffset = serverTime.getTime() - signTime.getTime()
    this.logger?.warn(
      'Got RequestTimeTooSkewed, correcting the clock by ' +
        String(signingContext.clockOffset) +
        'ms; server: ' +
        serverTime.toUTCString() +
        ', signed with: ' +
        signTime.toUTCString(),
    )
  }
}
