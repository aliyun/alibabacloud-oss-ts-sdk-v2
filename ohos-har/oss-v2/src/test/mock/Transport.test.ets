import { describe, expect, it } from '@ohos/hypium'
import netstack from '@ohos.net.http'
import { GetObject, OperationError, PutObject, SerializationError, ServiceError, streamBody } from '../../../Index'
import { SingleChunkStream } from '../unit/MockSupport'
import { BUCKET, CollectingSinkFactory, createClient, OBJECT_BODY, probeCount, STUB, STREAM_HALF, STREAM_LENGTH } from './Stubs'

/** A netstack `BusinessError`: an `Error` carrying a numeric code. */
interface BusinessError extends Error {
  code?: number
}

/**
 * The cases the node mock suite runs against the real transport, here against `@ohos.net.http` in the
 * Previewer. Responses are buffered whole on this platform unless the caller hands over a sink factory, so
 * the buffered case asserts that the body survived intact while the sink cases watch it arrive in pieces.
 */
export default function transportTest() {
  describe('Harmony transport over loopback', () => {
    it('reaches the runner loopback through @ohos.net.http', 0, async () => {
      const request = netstack.createHttp()
      let code: number = 0
      let text: string = ''
      try {
        const response = await request.request(STUB + '/probe', {
          method: netstack.RequestMethod.GET,
          expectDataType: netstack.HttpDataType.STRING,
          connectTimeout: 5000,
          readTimeout: 5000,
        })
        code = response.responseCode
        text = typeof response.result === 'string' ? response.result : ''
      } finally {
        request.destroy()
      }

      expect(code).assertEqual(200)
      expect(text).assertEqual('pong')
    })

    it('reads a GetObject response through netstack', 0, async () => {
      const path = '/' + BUCKET + '/dir/hello.txt'
      const result = await createClient().send(new GetObject({ bucket: BUCKET, key: 'dir/hello.txt' }))
      const body = (await result.body?.text()) ?? ''

      expect(result.statusCode).assertEqual(200)
      expect(result.requestId ?? '').assertEqual('mock-request-id')
      expect(result.etag ?? '').assertEqual('"etag-1"')
      expect(result.contentType ?? '').assertEqual('text/plain')
      expect(body).assertEqual(OBJECT_BODY)
      expect(await probeCount('count', 'GET', path)).assertEqual(1)
    })

    it('hands over a large buffered body intact', 0, async () => {
      const result = await createClient().send(new GetObject({ bucket: BUCKET, key: 'dir/stream.txt' }))
      const body = (await result.body?.text()) ?? ''
      const bytes = await result.body?.bytes()

      expect(result.contentLength ?? -1).assertEqual(STREAM_LENGTH)
      expect(body.length).assertEqual(STREAM_LENGTH)
      expect(bytes?.length ?? -1).assertEqual(STREAM_LENGTH)
      expect(body.charAt(0)).assertEqual('a')
      expect(body.charAt(STREAM_HALF - 1)).assertEqual('a')
      expect(body.charAt(STREAM_HALF)).assertEqual('b')
      expect(body.charAt(STREAM_LENGTH - 1)).assertEqual('b')
    })

    it('sends a PutObject body and reads its result headers', 0, async () => {
      const path = '/' + BUCKET + '/dir/hello.json'
      const result = await createClient().send(
        new PutObject({ bucket: BUCKET, key: 'dir/hello.json', body: '{"a":1}' }),
      )

      expect(result.statusCode).assertEqual(200)
      expect(result.etag ?? '').assertEqual('"etag-1"')
      expect(await probeCount('count', 'PUT', path)).assertEqual(1)
      expect(await probeCount('bytes', 'PUT', path)).assertEqual(7)
    })

    it('rejects a one-shot request body before sending it', 0, async () => {
      const path = '/' + BUCKET + '/dir/one-shot.txt'
      let error: Error | undefined
      try {
        await createClient().send(
          new PutObject({
            bucket: BUCKET,
            key: 'dir/one-shot.txt',
            body: streamBody(new SingleChunkStream(new Uint8Array([1, 2, 3]))),
          }),
        )
      } catch (caught) {
        error = caught as Error
      }

      expect(error instanceof OperationError).assertTrue()
      if (error instanceof OperationError) {
        expect(error.contains((cause) => cause instanceof SerializationError) instanceof SerializationError).assertTrue()
      }
      expect(await probeCount('count', 'PUT', path)).assertEqual(0)
    })

    it('pushes a streamed body into the sink the factory made', 0, async () => {
      const path = '/' + BUCKET + '/dir/sink.txt'
      const factory = new CollectingSinkFactory()
      const result = await createClient().send(
        new GetObject({ bucket: BUCKET, key: 'dir/sink.txt', sinkFactory: factory }),
      )
      const held = (await result.body?.bytes())?.length ?? -1
      const sink = factory.last()

      expect(result.statusCode).assertEqual(200)
      expect(result.etag ?? '').assertEqual('"etag-stream"')
      // One sink for one attempt, made with what the response declared before any byte arrived.
      expect(factory.made()).assertEqual(1)
      expect(factory.sizes[0]).assertEqual(STREAM_LENGTH)
      expect(sink.total()).assertEqual(STREAM_LENGTH)
      expect(sink.charAt(0)).assertEqual('a')
      expect(sink.charAt(STREAM_HALF - 1)).assertEqual('a')
      expect(sink.charAt(STREAM_HALF)).assertEqual('b')
      expect(sink.charAt(STREAM_LENGTH - 1)).assertEqual('b')
      // Every byte went to the caller as it arrived, so the result holds nothing of its own.
      expect(held).assertEqual(0)
      expect(await probeCount('count', 'GET', path)).assertEqual(1)
    })

    // A response marks itself a failure in its headers, which is the only signal before the body, so the
    // document stays with the error and never reaches the caller's file.
    it('never builds a sink for a marked failure', 0, async () => {
      const path = '/' + BUCKET + '/dir/sink-missing.txt'
      const factory = new CollectingSinkFactory()
      let error: Error | undefined
      try {
        await createClient().send(
          new GetObject({ bucket: BUCKET, key: 'dir/sink-missing.txt', sinkFactory: factory }),
        )
      } catch (caught) {
        error = caught as Error
      }

      expect(error instanceof OperationError).assertTrue()
      if (error instanceof OperationError) {
        const service = error.contains((cause) => cause instanceof ServiceError)
        expect(service instanceof ServiceError).assertTrue()
        if (service instanceof ServiceError) {
          expect(service.code).assertEqual('NoSuchKey')
          expect(service.statusCode).assertEqual(404)
        }
      }
      // An error document belongs to the error, not to the file the caller asked for.
      expect(factory.made()).assertEqual(0)
      expect(await probeCount('count', 'GET', path)).assertEqual(1)
    })

    // Without a mark the transport had nothing to route on: the document lands in the sink, and the failure
    // reaches the caller as its status alone.
    it('streams a failure that carries no mark, and reports its status', 0, async () => {
      const path = '/' + BUCKET + '/dir/sink-unmarked.txt'
      const factory = new CollectingSinkFactory()
      let error: Error | undefined
      try {
        await createClient().send(
          new GetObject({ bucket: BUCKET, key: 'dir/sink-unmarked.txt', sinkFactory: factory }),
        )
      } catch (caught) {
        error = caught as Error
      }

      expect(error instanceof OperationError).assertTrue()
      if (error instanceof OperationError) {
        const service = error.contains((cause) => cause instanceof ServiceError)
        expect(service instanceof ServiceError).assertTrue()
        if (service instanceof ServiceError) {
          expect(service.statusCode).assertEqual(404)
          expect(service.code).assertEqual('BadErrorResponse')
        }
      }
      expect(factory.made()).assertEqual(1)
      expect(factory.last().charAt(0)).assertEqual('<')
      expect(await probeCount('count', 'GET', path)).assertEqual(1)
    })

    // netstack applies `maxLimit` to a buffered body only, so this body arrives whole when streamed and is
    // refused at the same cap when buffered.
    it('streams a body larger than the maxLimit the buffered call refuses', 0, async () => {
      const url = STUB + '/' + BUCKET + '/dir/sink.txt'
      const cap = 64 * 1024
      const options: netstack.HttpRequestOptions = {
        method: netstack.RequestMethod.GET,
        expectDataType: netstack.HttpDataType.ARRAY_BUFFER,
        maxLimit: cap,
        readTimeout: 5000,
      }

      const stream = netstack.createHttp()
      let received = 0
      let refused = 0
      await new Promise<void>((resolve: () => void) => {
        stream.on('dataReceive', (chunk: ArrayBuffer) => {
          received += chunk.byteLength
        })
        stream.requestInStream(url, options).then((_code: number) => {
          resolve()
        }, (err: Object) => {
          refused = (err as BusinessError).code ?? 0
          resolve()
        })
      })
      stream.destroy()

      expect(refused).assertEqual(0)
      expect(received).assertEqual(STREAM_LENGTH)

      const buffered = netstack.createHttp()
      let capped = 0
      try {
        await buffered.request(url, options)
      } catch (caught) {
        capped = (caught as BusinessError).code ?? 0
      }
      buffered.destroy()

      // The control: the cap is honoured where it applies.
      expect(capped).assertEqual(2300023)
    })
  })
}
