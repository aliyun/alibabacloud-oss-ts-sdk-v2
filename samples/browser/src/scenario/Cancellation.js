// Demonstrates: Cancel an in-flight request with an AbortSignal, and recognise the CanceledError.
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.js'

export async function run(log, key = 'sample/hello.txt') {
  // The browser's AbortController produces a signal that satisfies the SDK's `AbortSignalLike`; a
  // per-call deadline is expressed this way, since `send` takes no whole-request timeout.
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), 50)
  try {
    const result = await createClient().send(new oss.GetObject({ bucket: bucket(), key }), {
      signal: controller.signal,
    })
    clearTimeout(deadline)
    log('finished before the deadline: ' + key + ' (' + String(result.contentLength) + ' B)')
  } catch (error) {
    clearTimeout(deadline)
    const canceled =
      error instanceof oss.CanceledError
        ? error
        : error instanceof oss.OperationError
          ? error.contains((inner) => inner instanceof oss.CanceledError)
          : undefined
    if (canceled instanceof oss.CanceledError) {
      log('cancelled: the 50ms deadline fired before the request completed')
      return
    }
    report(error, log)
  }
}
