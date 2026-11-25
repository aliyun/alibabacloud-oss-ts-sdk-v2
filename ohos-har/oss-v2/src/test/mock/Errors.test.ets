import { describe, expect, it } from '@ohos/hypium'
import { GetObject, OperationError, PutObject, ServiceError } from '../../../Index'
import { BUCKET, createClient, DEAD, probeCount } from './Stubs'

/**
 * How a service status and a platform failure reach the caller once the real netstack transport is in the
 * way: the wrapper names the operation, the cause chain still carries the service's own code, and only
 * retryable failures consume more than one attempt.
 */
export default function errorsTest() {
  describe('Harmony error mapping over loopback', () => {
    it('maps a 404 to a ServiceError without retrying', 0, async () => {
      const path = '/' + BUCKET + '/dir/missing.txt'
      let error: Error | undefined
      try {
        await createClient().send(new GetObject({ bucket: BUCKET, key: 'dir/missing.txt' }))
      } catch (caught) {
        error = caught as Error
      }

      expect(error instanceof OperationError).assertTrue()
      if (error instanceof OperationError) {
        expect(error.opName).assertEqual('GetObject')
        const service = error.contains((cause) => cause instanceof ServiceError)
        expect(service instanceof ServiceError).assertTrue()
        if (service instanceof ServiceError) {
          expect(service.code).assertEqual('NoSuchKey')
          expect(service.statusCode).assertEqual(404)
          expect(service.requestId).assertEqual('req-404')
        }
      }
      expect(await probeCount('count', 'GET', path)).assertEqual(1)
    })

    it('retries a 503 and returns the response of the later attempt', 0, async () => {
      const path = '/' + BUCKET + '/dir/flaky.txt'
      const result = await createClient().send(
        new PutObject({ bucket: BUCKET, key: 'dir/flaky.txt', body: 'retry me' }),
      )

      expect(result.statusCode).assertEqual(200)
      expect(result.etag ?? '').assertEqual('"etag-2"')
      expect(await probeCount('count', 'PUT', path)).assertEqual(2)
      // The body has to reach the socket twice, so a replayable one is what makes the retry possible.
      expect(await probeCount('bytes', 'PUT', path)).assertEqual(16)
    })

    it('surfaces the service error when the attempt budget is one', 0, async () => {
      const path = '/' + BUCKET + '/dir/stopped.txt'
      let error: Error | undefined
      try {
        await createClient().send(new PutObject({ bucket: BUCKET, key: 'dir/stopped.txt', body: 'once' }), {
          retryMaxAttempts: 1,
        })
      } catch (caught) {
        error = caught as Error
      }

      expect(error instanceof OperationError).assertTrue()
      if (error instanceof OperationError) {
        const service = error.contains((cause) => cause instanceof ServiceError)
        expect(service instanceof ServiceError).assertTrue()
        if (service instanceof ServiceError) {
          expect(service.code).assertEqual('InternalError')
          expect(service.statusCode).assertEqual(503)
        }
      }
      expect(await probeCount('count', 'PUT', path)).assertEqual(1)
    })

    it('reports a refused connection as an operation error', 0, async () => {
      let error: Error | undefined
      try {
        await createClient(DEAD).send(new GetObject({ bucket: BUCKET, key: 'dir/hello.txt' }))
      } catch (caught) {
        error = caught as Error
      }

      expect(error instanceof OperationError).assertTrue()
      if (error instanceof OperationError) {
        expect(error.opName).assertEqual('GetObject')
      }
    })
  })
}
