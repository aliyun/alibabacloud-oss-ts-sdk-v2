import { describe, expect, it } from '@ohos/hypium'
import { Client, GetObject, OperationError, ParamRequiredError, PutObject, ServiceError, StaticCredentialsProvider } from '../../../Index'
import type { HttpTransport } from '../../../Index'
import { CannedResponse, createClient, FailingTransport, MockTransport } from './MockSupport'
import { serverErrorHeaders } from './response-headers'

function createSingleAttemptClient(transport: HttpTransport): Client {
  return new Client({
    region: 'cn-hangzhou',
    credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
    transport,
    retryMaxAttempts: 1
  })
}

export default function clientErrorsTest() {
  describe('Client errors', () => {
    it('reports a BadErrorResponse when the error body is not XML', 0, async () => {
      const transport = new MockTransport([
        new CannedResponse(400, 'Bad Request', serverErrorHeaders(), 'plain text failure')
      ])
      let error: Error | undefined
      try {
        await createClient(transport).send(new GetObject({ bucket: 'bucket', key: 'dir/key.txt' }))
      } catch (caught) {
        error = caught as Error
      }

      expect(error instanceof OperationError).assertTrue()
      if (!(error instanceof OperationError)) {
        return
      }
      const service = error.contains((cause) => cause instanceof ServiceError)
      expect(service instanceof ServiceError).assertTrue()
      if (service instanceof ServiceError) {
        expect(service.statusCode).assertEqual(400)
        expect(service.code).assertEqual('BadErrorResponse')
        expect(service.requestId).assertEqual('req-err')
      }
    })

    it('reports a ParamRequiredError without sending the request', 0, async () => {
      const transport = new MockTransport([
        new CannedResponse(200, 'OK', serverErrorHeaders())
      ])
      let error: Error | undefined
      try {
        await createClient(transport).send(new PutObject({ bucket: 'bucket', body: 'hello' }))
      } catch (caught) {
        error = caught as Error
      }

      expect(transport.requests.length).assertEqual(0)
      expect(error instanceof OperationError).assertTrue()
      if (!(error instanceof OperationError)) {
        return
      }
      expect(error.opName).assertEqual('PutObject')
      const param = error.contains((cause) => cause instanceof ParamRequiredError)
      expect(param instanceof ParamRequiredError).assertTrue()
      if (param instanceof ParamRequiredError) {
        expect(param.field).assertEqual('key')
      }
    })

    it('wraps a transport failure in an OperationError', 0, async () => {
      const transport = new FailingTransport(new Error('connection reset'))
      let error: Error | undefined
      try {
        await createSingleAttemptClient(transport).send(new GetObject({ bucket: 'bucket', key: 'dir/key.txt' }))
      } catch (caught) {
        error = caught as Error
      }

      expect(transport.requests.length).assertEqual(1)
      expect(error instanceof OperationError).assertTrue()
      if (!(error instanceof OperationError)) {
        return
      }
      expect(error.opName).assertEqual('GetObject')
      expect(error.contains((cause) => cause.message === 'connection reset') !== undefined).assertTrue()
    })
  })
}
