import { describe, expect, it } from '@ohos/hypium'
import netstack from '@ohos.net.http'
import {
  Client,
  FixedDelayBackoff,
  GetObject,
  PutObject,
  StandardRetryer,
  StaticCredentialsProvider,
} from '../../../Index'
import { STUB_PORT } from './stub-port'

/** Where `scripts/harmony-loopback-server.mjs` listens. */
const STUB: string = 'http://127.0.0.1:' + STUB_PORT
const OBJECT_KEY: string = 'dir/hello.txt'
const OBJECT_BODY: string = 'hello from loopback'

/** No transport, so the client falls back to the netstack one. One attempt keeps an unreachable stub short. */
function createClient(): Client {
  return new Client({
    region: 'cn-hangzhou',
    endpoint: STUB,
    credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
    retryer: new StandardRetryer({ maxAttempts: 1, backoff: new FixedDelayBackoff(0) }),
  })
}

export default function loopbackTest() {
  describe('Loopback netstack', () => {
    it('reaches the runner loopback through @ohos.net.http', 0, async () => {
      console.log('loopback stub url: ' + STUB)
      const request = netstack.createHttp()
      let text: string = ''
      let code: number = 0
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

    it('reads an object over the loopback stub', 0, async () => {
      const result = await createClient().send(new GetObject({ bucket: 'mock-bucket', key: OBJECT_KEY }))
      const body = (await result.body?.text()) ?? ''

      expect(result.statusCode).assertEqual(200)
      expect(result.etag ?? '').assertEqual('"stub-etag"')
      expect(body).assertEqual(OBJECT_BODY)
    })

    it('sends a request body over the loopback stub', 0, async () => {
      const result = await createClient().send(
        new PutObject({ bucket: 'mock-bucket', key: OBJECT_KEY, body: OBJECT_BODY }),
      )

      expect(result.statusCode).assertEqual(200)
      expect(result.etag ?? '').assertEqual('"stub-etag"')
    })
  })
}
