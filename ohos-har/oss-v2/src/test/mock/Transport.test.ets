import { describe, expect, it } from '@ohos/hypium'
import netstack from '@ohos.net.http'
import { GetObject, OperationError, PutObject, SerializationError, streamBody } from '../../../Index'
import { SingleChunkStream } from '../unit/MockSupport'
import { BUCKET, createClient, OBJECT_BODY, probeCount, STUB, STREAM_HALF, STREAM_LENGTH } from './Stubs'

/**
 * The cases the node mock suite runs against the real transport, here against `@ohos.net.http` in the
 * Previewer. Responses are buffered whole on this platform, so the streaming case asserts that the buffered
 * body survived intact rather than that it arrived in pieces.
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
  })
}
