import { describe, expect, it } from '@ohos/hypium'
import { DescribeRegions, ListBuckets } from '../../../Index'
import { CannedResponse, createClient, EMPTY_BODY_MD5, MockTransport } from './MockSupport'
import { okHeaders } from './response-headers'

const BUCKETS_XML: string = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<ListAllMyBucketsResult>' +
  '<Prefix>my</Prefix>' +
  '<MaxKeys>50</MaxKeys>' +
  '<IsTruncated>true</IsTruncated>' +
  '<NextMarker>my-bucket-3</NextMarker>' +
  '<Owner><ID>1234567890</ID><DisplayName>owner-name</DisplayName></Owner>' +
  '<Buckets>' +
  '<Bucket><Name>my-bucket-1</Name><Region>cn-hangzhou</Region><Location>oss-cn-hangzhou</Location><StorageClass>Standard</StorageClass><ExtranetEndpoint>oss-cn-hangzhou.aliyuncs.com</ExtranetEndpoint><IntranetEndpoint>oss-cn-hangzhou-internal.aliyuncs.com</IntranetEndpoint><CreationDate>2026-06-01T00:00:00.000Z</CreationDate></Bucket>' +
  '<Bucket><Name>my-bucket-2</Name><Region>cn-hangzhou</Region><Location>oss-cn-hangzhou</Location><StorageClass>IA</StorageClass><ExtranetEndpoint>oss-cn-hangzhou.aliyuncs.com</ExtranetEndpoint><IntranetEndpoint>oss-cn-hangzhou-internal.aliyuncs.com</IntranetEndpoint><CreationDate>2026-06-02T00:00:00.000Z</CreationDate></Bucket>' +
  '</Buckets>' +
  '</ListAllMyBucketsResult>'

const REGIONS_XML: string = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<RegionInfoList>' +
  '<RegionInfo><Region>oss-cn-hangzhou</Region><InternetEndpoint>oss-cn-hangzhou.aliyuncs.com</InternetEndpoint><InternalEndpoint>oss-cn-hangzhou-internal.aliyuncs.com</InternalEndpoint><AccelerateEndpoint>oss-accelerate.aliyuncs.com</AccelerateEndpoint></RegionInfo>' +
  '<RegionInfo><Region>oss-cn-shanghai</Region><InternetEndpoint>oss-cn-shanghai.aliyuncs.com</InternetEndpoint><InternalEndpoint>oss-cn-shanghai-internal.aliyuncs.com</InternalEndpoint><AccelerateEndpoint>oss-accelerate.aliyuncs.com</AccelerateEndpoint></RegionInfo>' +
  '</RegionInfoList>'

export default function clientServiceTest() {
  describe('Client service', () => {
    it('serializes ListBuckets and deserializes its result', 0, async () => {
      const transport = new MockTransport([
        new CannedResponse(200, 'OK', okHeaders(), BUCKETS_XML)
      ])
      const result = await createClient(transport).send(new ListBuckets({
        prefix: 'my',
        maxKeys: 50
      }))

      expect(transport.requests.length).assertEqual(1)
      expect(transport.requests[0].method).assertEqual('GET')
      expect(transport.requests[0].url).assertEqual('https://oss-cn-hangzhou.aliyuncs.com/?max-keys=50&prefix=my')
      expect(transport.requests[0].headers.get('Content-MD5')).assertEqual(EMPTY_BODY_MD5)
      expect(result.statusCode).assertEqual(200)
      expect(result.requestId).assertEqual('req-ok')
      expect(result.prefix).assertEqual('my')
      expect(result.maxKeys).assertEqual(50)
      expect(result.isTruncated).assertEqual(true)
      expect(result.nextMarker).assertEqual('my-bucket-3')
      expect(result.owner?.id).assertEqual('1234567890')
      expect(result.owner?.displayName).assertEqual('owner-name')
      expect(result.buckets?.length).assertEqual(2)
      expect(result.buckets?.[0]?.name).assertEqual('my-bucket-1')
      expect(result.buckets?.[0]?.region).assertEqual('cn-hangzhou')
      expect(result.buckets?.[0]?.storageClass).assertEqual('Standard')
      expect(result.buckets?.[0]?.extranetEndpoint).assertEqual('oss-cn-hangzhou.aliyuncs.com')
      expect(result.buckets?.[0]?.intranetEndpoint).assertEqual('oss-cn-hangzhou-internal.aliyuncs.com')
      expect(result.buckets?.[0]?.creationDate !== undefined).assertTrue()
      expect(result.buckets?.[1]?.name).assertEqual('my-bucket-2')
      expect(result.buckets?.[1]?.storageClass).assertEqual('IA')
    })

    it('serializes DescribeRegions and deserializes its result', 0, async () => {
      const transport = new MockTransport([
        new CannedResponse(200, 'OK', okHeaders(), REGIONS_XML)
      ])
      const result = await createClient(transport).send(new DescribeRegions({
        regions: 'oss-cn-hangzhou'
      }))

      expect(transport.requests.length).assertEqual(1)
      expect(transport.requests[0].method).assertEqual('GET')
      expect(transport.requests[0].url).assertEqual('https://oss-cn-hangzhou.aliyuncs.com/?regions=oss-cn-hangzhou')
      expect(transport.requests[0].headers.get('Content-MD5')).assertEqual(EMPTY_BODY_MD5)
      expect(result.statusCode).assertEqual(200)
      expect(result.requestId).assertEqual('req-ok')
      expect(result.regionInfo?.length).assertEqual(2)
      expect(result.regionInfo?.[0]?.region).assertEqual('oss-cn-hangzhou')
      expect(result.regionInfo?.[0]?.internetEndpoint).assertEqual('oss-cn-hangzhou.aliyuncs.com')
      expect(result.regionInfo?.[0]?.internalEndpoint).assertEqual('oss-cn-hangzhou-internal.aliyuncs.com')
      expect(result.regionInfo?.[0]?.accelerateEndpoint).assertEqual('oss-accelerate.aliyuncs.com')
      expect(result.regionInfo?.[1]?.region).assertEqual('oss-cn-shanghai')
    })
  })
}
