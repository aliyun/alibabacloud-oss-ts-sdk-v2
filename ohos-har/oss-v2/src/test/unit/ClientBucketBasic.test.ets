import { describe, expect, it } from '@ohos/hypium'
import { GetBucketInfo, ListObjectsV2, PutBucket } from '../../../Index'
import { CannedResponse, createClient, MockTransport, readBodyText } from './MockSupport'
import { okHeaders } from './response-headers'

const BUCKET_INFO_XML: string = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<BucketInfo>' +
  '<Bucket>' +
  '<Comment></Comment>' +
  '<CreationDate>2026-06-01T00:00:00.000Z</CreationDate>' +
  '<ExtranetEndpoint>oss-cn-hangzhou.aliyuncs.com</ExtranetEndpoint>' +
  '<IntranetEndpoint>oss-cn-hangzhou-internal.aliyuncs.com</IntranetEndpoint>' +
  '<Location>oss-cn-hangzhou</Location>' +
  '<Name>bucket</Name>' +
  '<StorageClass>Standard</StorageClass>' +
  '<DataRedundancyType>LRS</DataRedundancyType>' +
  '<Owner><ID>1234</ID><DisplayName>owner-name</DisplayName></Owner>' +
  '<AccessControlList><Grant>private</Grant></AccessControlList>' +
  '</Bucket>' +
  '</BucketInfo>'

const OBJECTS_V2_XML: string = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<ListBucketResult>' +
  '<Name>bucket</Name>' +
  '<Prefix>dir%2F</Prefix>' +
  '<MaxKeys>200</MaxKeys>' +
  '<Delimiter>%2F</Delimiter>' +
  '<IsTruncated>false</IsTruncated>' +
  '<KeyCount>3</KeyCount>' +
  '<EncodingType>url</EncodingType>' +
  '<Contents>' +
  '<Key>dir%2Fb%20c.txt</Key>' +
  '<Type>Normal</Type>' +
  '<Size>1024</Size>' +
  '<ETag>"etag-1"</ETag>' +
  '<LastModified>2026-06-01T00:00:00.000Z</LastModified>' +
  '<StorageClass>Standard</StorageClass>' +
  '</Contents>' +
  '<Contents>' +
  '<Key>dir%2Fa.txt</Key>' +
  '<Type>Normal</Type>' +
  '<Size>512</Size>' +
  '<ETag>"etag-2"</ETag>' +
  '<LastModified>2026-06-02T00:00:00.000Z</LastModified>' +
  '<StorageClass>Standard</StorageClass>' +
  '</Contents>' +
  '<CommonPrefixes><Prefix>dir%2Fsub%2F</Prefix></CommonPrefixes>' +
  '</ListBucketResult>'

export default function clientBucketBasicTest() {
  describe('Client bucket basic', () => {
    it('serializes PutBucket with its XML body and MD5', 0, async () => {
      const transport = new MockTransport([
        new CannedResponse(200, 'OK', okHeaders())
      ])
      const result = await createClient(transport).send(new PutBucket({
        bucket: 'bucket',
        acl: 'public-read',
        createBucketConfiguration: {
          storageClass: 'IA',
          dataRedundancyType: 'ZRS'
        }
      }))

      expect(transport.requests.length).assertEqual(1)
      expect(transport.requests[0].method).assertEqual('PUT')
      expect(transport.requests[0].url).assertEqual('https://bucket.oss-cn-hangzhou.aliyuncs.com/')
      expect(transport.requests[0].headers.get('Content-Type')).assertEqual('application/xml')
      expect(transport.requests[0].headers.get('Content-MD5')).assertEqual('zuCmetKMfHQHzWyoXgr8mQ==')
      expect(transport.requests[0].headers.get('x-oss-acl')).assertEqual('public-read')
      expect(await readBodyText(transport.requests[0])).assertEqual(
        '<?xml version="1.0" encoding="UTF-8"?><CreateBucketConfiguration><StorageClass>IA</StorageClass><DataRedundancyType>ZRS</DataRedundancyType></CreateBucketConfiguration>'
      )
      expect(result.statusCode).assertEqual(200)
      expect(result.requestId).assertEqual('req-ok')
    })

    it('serializes GetBucketInfo and deserializes its result', 0, async () => {
      const transport = new MockTransport([
        new CannedResponse(200, 'OK', okHeaders(), BUCKET_INFO_XML)
      ])
      const result = await createClient(transport).send(new GetBucketInfo({
        bucket: 'bucket'
      }))

      expect(transport.requests.length).assertEqual(1)
      expect(transport.requests[0].method).assertEqual('GET')
      expect(transport.requests[0].url).assertEqual('https://bucket.oss-cn-hangzhou.aliyuncs.com/?bucketInfo')
      expect(result.statusCode).assertEqual(200)
      expect(result.requestId).assertEqual('req-ok')
      expect(result.bucketInfo?.name).assertEqual('bucket')
      expect(result.bucketInfo?.location).assertEqual('oss-cn-hangzhou')
      expect(result.bucketInfo?.storageClass).assertEqual('Standard')
      expect(result.bucketInfo?.dataRedundancyType).assertEqual('LRS')
      expect(result.bucketInfo?.extranetEndpoint).assertEqual('oss-cn-hangzhou.aliyuncs.com')
      expect(result.bucketInfo?.intranetEndpoint).assertEqual('oss-cn-hangzhou-internal.aliyuncs.com')
      expect(result.bucketInfo?.owner?.id).assertEqual('1234')
      expect(result.bucketInfo?.accessControlList?.grant).assertEqual('private')
    })

    it('serializes ListObjectsV2 and deserializes url-encoded keys', 0, async () => {
      const transport = new MockTransport([
        new CannedResponse(200, 'OK', okHeaders(), OBJECTS_V2_XML)
      ])
      const result = await createClient(transport).send(new ListObjectsV2({
        bucket: 'bucket',
        prefix: 'dir/',
        delimiter: '/',
        maxKeys: 200
      }))

      expect(transport.requests.length).assertEqual(1)
      expect(transport.requests[0].method).assertEqual('GET')
      expect(transport.requests[0].url).assertEqual(
        'https://bucket.oss-cn-hangzhou.aliyuncs.com/?delimiter=%2F&encoding-type=url&list-type=2&max-keys=200&prefix=dir%2F'
      )
      expect(result.statusCode).assertEqual(200)
      expect(result.requestId).assertEqual('req-ok')
      expect(result.name).assertEqual('bucket')
      expect(result.prefix).assertEqual('dir/')
      expect(result.maxKeys).assertEqual(200)
      expect(result.delimiter).assertEqual('/')
      expect(result.isTruncated).assertEqual(false)
      expect(result.keyCount).assertEqual(3)
      expect(result.encodingType).assertEqual('url')
      expect(result.contents?.length).assertEqual(2)
      expect(result.contents?.[0]?.key).assertEqual('dir/b c.txt')
      expect(result.contents?.[0]?.type).assertEqual('Normal')
      expect(result.contents?.[0]?.size).assertEqual(1024)
      expect(result.contents?.[0]?.etag).assertEqual('"etag-1"')
      expect(result.contents?.[0]?.lastModified !== undefined).assertTrue()
      expect(result.contents?.[0]?.storageClass).assertEqual('Standard')
      expect(result.contents?.[1]?.key).assertEqual('dir/a.txt')
      expect(result.contents?.[1]?.size).assertEqual(512)
      expect(result.commonPrefixes?.length).assertEqual(1)
      expect(result.commonPrefixes?.[0]?.prefix).assertEqual('dir/sub/')
    })
  })
}
