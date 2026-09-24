import { describe, expect, it } from '@ohos/hypium'
import { Client, GetObject, PutObject, StaticCredentialsProvider } from '../../../Index'
import { CannedResponse, MockTransport } from './MockSupport'
import { putObjectHeaders, successHeaders } from './response-headers'

function createGetResponse(): MockTransport {
  return new MockTransport([new CannedResponse(200, 'OK', successHeaders(), 'hello')])
}

export default function clientMiscTest() {
  describe('Client misc', () => {
    it('prefers an explicit endpoint over the region', 0, async () => {
      const transport = createGetResponse()
      await new Client({
        region: 'cn-hangzhou',
        endpoint: 'https://oss.example.com',
        credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
        transport
      }).send(new GetObject({ bucket: 'bucket', key: 'dir/key.txt' }))

      expect(transport.requests.length).assertEqual(1)
      expect(transport.requests[0].url).assertEqual('https://bucket.oss.example.com/dir/key.txt')
    })

    it('resolves http endpoints when SSL is disabled', 0, async () => {
      const transport = createGetResponse()
      await new Client({
        region: 'cn-hangzhou',
        disableSsl: true,
        credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
        transport
      }).send(new GetObject({ bucket: 'bucket', key: 'dir/key.txt' }))

      expect(transport.requests[0].url).assertEqual('http://bucket.oss-cn-hangzhou.aliyuncs.com/dir/key.txt')
    })

    it('addresses the bucket in the path when path style is set', 0, async () => {
      const transport = createGetResponse()
      await new Client({
        region: 'cn-hangzhou',
        usePathStyle: true,
        credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
        transport
      }).send(new GetObject({ bucket: 'bucket', key: 'dir/key.txt' }))

      expect(transport.requests[0].url).assertEqual('https://oss-cn-hangzhou.aliyuncs.com/bucket/dir/key.txt')
    })

    it('drops the bucket from the host for CNAME endpoints', 0, async () => {
      const transport = createGetResponse()
      await new Client({
        region: 'cn-hangzhou',
        endpoint: 'https://cdn.example.com',
        useCname: true,
        credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
        transport
      }).send(new GetObject({ bucket: 'bucket', key: 'dir/key.txt' }))

      expect(transport.requests[0].url).assertEqual('https://cdn.example.com/dir/key.txt')
    })

    it('falls back to path style for IP endpoints', 0, async () => {
      const transport = createGetResponse()
      await new Client({
        region: 'cn-hangzhou',
        endpoint: 'http://10.0.0.8',
        credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
        transport
      }).send(new GetObject({ bucket: 'bucket', key: 'dir/key.txt' }))

      expect(transport.requests[0].url).assertEqual('http://10.0.0.8/bucket/dir/key.txt')
    })

    it('signs with OSS V1 when signerVersion is v1', 0, async () => {
      const transport = createGetResponse()
      await new Client({
        region: 'cn-hangzhou',
        signerVersion: 'v1',
        credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
        transport
      }).send(new GetObject({ bucket: 'bucket', key: 'dir/key.txt' }))

      expect(transport.requests[0].headers.get('Authorization')?.startsWith('OSS ak:')).assertTrue()
      expect(transport.requests[0].headers.get('Date') !== undefined).assertTrue()
    })

    it('leaves the content type unset when detection is disabled', 0, async () => {
      const transport = new MockTransport([
        new CannedResponse(200, 'OK', putObjectHeaders())
      ])
      await new Client({
        region: 'cn-hangzhou',
        disableAutoDetectMimeType: true,
        credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
        transport
      }).send(new PutObject({ bucket: 'bucket', key: 'dir/k.png', body: 'hello' }))

      expect(transport.requests[0].headers.get('Content-Type') === undefined).assertTrue()
    })
  })
}
