import { describe, expect, it } from '@ohos/hypium'
import { DeleteObject, HeadObject, PutObject } from '../../../Index'
import { CannedResponse, createClient, EMPTY_BODY_MD5, MockTransport, readBodyText } from './MockSupport'
import { deleteObjectHeaders, headObjectHeaders, putObjectHeaders } from './response-headers'

export default function clientObjectBasicTest() {
  describe('Client object basic', () => {
    it('serializes PutObject and deserializes its result', 0, async () => {
      const transport = new MockTransport([
        new CannedResponse(200, 'OK', putObjectHeaders())
      ])
      const result = await createClient(transport).send(new PutObject({
        bucket: 'bucket',
        key: 'dir/k.png',
        body: 'hello',
        acl: 'private',
        contentLength: 5
      }))

      expect(transport.requests.length).assertEqual(1)
      expect(transport.requests[0].method).assertEqual('PUT')
      expect(transport.requests[0].url).assertEqual('https://bucket.oss-cn-hangzhou.aliyuncs.com/dir/k.png')
      expect(transport.requests[0].headers.get('Content-Type')).assertEqual('image/png')
      expect(transport.requests[0].headers.get('Content-Length')).assertEqual('5')
      expect(transport.requests[0].headers.get('x-oss-object-acl')).assertEqual('private')
      expect(transport.requests[0].body?.length).assertEqual(5)
      expect(await readBodyText(transport.requests[0])).assertEqual('hello')
      expect(result.statusCode).assertEqual(200)
      expect(result.requestId).assertEqual('req-put')
      expect(result.etag).assertEqual('etag-put')
      expect(result.versionId).assertEqual('version-put')
    })

    it('serializes HeadObject and deserializes its headers', 0, async () => {
      const transport = new MockTransport([
        new CannedResponse(200, 'OK', headObjectHeaders())
      ])
      const result = await createClient(transport).send(new HeadObject({
        bucket: 'bucket',
        key: 'dir/k.txt',
        versionId: 'v1'
      }))

      expect(transport.requests.length).assertEqual(1)
      expect(transport.requests[0].method).assertEqual('HEAD')
      expect(transport.requests[0].url).assertEqual('https://bucket.oss-cn-hangzhou.aliyuncs.com/dir/k.txt?versionId=v1')
      expect(transport.requests[0].headers.get('Content-MD5') === undefined).assertTrue()
      expect(result.statusCode).assertEqual(200)
      expect(result.requestId).assertEqual('req-head')
      expect(result.contentLength).assertEqual(11)
      expect(result.contentType).assertEqual('text/plain')
      expect(result.etag).assertEqual('etag-head')
      expect(result.lastModified !== undefined).assertTrue()
      expect(result.versionId).assertEqual('version-head')
    })

    it('serializes DeleteObject and deserializes its result', 0, async () => {
      const transport = new MockTransport([
        new CannedResponse(204, 'No Content', deleteObjectHeaders())
      ])
      const result = await createClient(transport).send(new DeleteObject({
        bucket: 'bucket',
        key: 'dir/k.txt',
        versionId: 'v1'
      }))

      expect(transport.requests.length).assertEqual(1)
      expect(transport.requests[0].method).assertEqual('DELETE')
      expect(transport.requests[0].url).assertEqual('https://bucket.oss-cn-hangzhou.aliyuncs.com/dir/k.txt?versionId=v1')
      expect(transport.requests[0].headers.get('Content-MD5')).assertEqual(EMPTY_BODY_MD5)
      expect(result.statusCode).assertEqual(204)
      expect(result.requestId).assertEqual('req-del')
      expect(result.versionId).assertEqual('version-del')
      expect(result.deleteMarker).assertEqual(true)
    })
  })
}
