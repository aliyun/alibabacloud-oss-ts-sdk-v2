import { describe, expect, it } from 'vitest'
import { DescribeRegions, ListBuckets } from '../../../src/api/service.js'
import { DeserializationError } from '../../../src/error/types.js'
import type { OperationOutput } from '../../../src/types.js'
import { textBody } from '../../fixtures/mock-transport.js'
import { headersOf } from '../../fixtures/serialized-headers.js'

function output(body: string): OperationOutput {
  return {
    input: { opName: 'Test', method: 'GET' },
    status: 'OK',
    statusCode: 200,
    headers: { 'x-oss-request-id': 'req-1' },
    body: textBody(body),
  }
}

// The md5 of no bytes.
const EMPTY_BODY_MD5 = '1B2M2Y8AsgTpgAmY7PhCfg=='

const BUCKETS = `<?xml version="1.0" encoding="UTF-8"?>
<ListAllMyBucketsResult>
  <Prefix>my</Prefix>
  <Marker>bucket-0</Marker>
  <MaxKeys>2</MaxKeys>
  <IsTruncated>true</IsTruncated>
  <NextMarker>bucket-3</NextMarker>
  <Owner>
    <ID>1234567890</ID>
    <DisplayName>owner-1</DisplayName>
  </Owner>
  <Buckets>
    <Bucket>
      <Name>my-bucket-1</Name>
      <Region>oss-cn-hangzhou</Region>
      <Location>oss-cn-hangzhou</Location>
      <StorageClass>Standard</StorageClass>
      <ExtranetEndpoint>oss-cn-hangzhou.aliyuncs.com</ExtranetEndpoint>
      <IntranetEndpoint>oss-cn-hangzhou-internal.aliyuncs.com</IntranetEndpoint>
      <CreationDate>2022-12-28T10:27:41.000Z</CreationDate>
    </Bucket>
    <Bucket>
      <Name>my-bucket-2</Name>
      <Region>oss-cn-shanghai</Region>
      <StorageClass>IA</StorageClass>
    </Bucket>
  </Buckets>
</ListAllMyBucketsResult>`

const EMPTY_BUCKETS = `<?xml version="1.0" encoding="UTF-8"?>
<ListAllMyBucketsResult>
  <Prefix></Prefix>
  <Marker></Marker>
  <MaxKeys>100</MaxKeys>
  <IsTruncated>false</IsTruncated>
  <Owner><ID>1234567890</ID><DisplayName>owner-1</DisplayName></Owner>
  <Buckets></Buckets>
</ListAllMyBucketsResult>`

describe('ListBuckets serialize', () => {
  it('sends a service-level GET with the empty-body MD5 and no bucket', async () => {
    const command = new ListBuckets()
    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('ListBuckets')
    expect(serialized.method).toBe('GET')
    expect(serialized.bucket).toBeUndefined()
    expect(serialized.key).toBeUndefined()
    expect(headersOf(serialized)).toEqual({ 'Content-MD5': EMPTY_BODY_MD5 })
    expect(serialized.parameters).toEqual({})
    expect(serialized.opMetadata).toBeUndefined()
  })

  it('maps resourceGroupId to a header and the rest to query parameters', async () => {
    const command = new ListBuckets({
      resourceGroupId: 'rg-aekz****',
      prefix: 'my',
      marker: 'bucket-0',
      maxKeys: 50,
      tagKey: 'env',
      tagValue: 'prod',
    })

    const serialized = await command.serialize(command.input)

    expect(headersOf(serialized)).toEqual({ 'x-oss-resource-group-id': 'rg-aekz****', 'Content-MD5': EMPTY_BODY_MD5 })
    expect(serialized.parameters).toEqual({
      prefix: 'my',
      marker: 'bucket-0',
      'max-keys': '50',
      'tag-key': 'env',
      'tag-value': 'prod',
    })
  })
})

describe('ListBuckets deserialize', () => {
  it('reads the page-level fields, the owner, and every Bucket', async () => {
    const command = new ListBuckets()
    const result = await command.deserialize(output(BUCKETS))

    expect(result.requestId).toBe('req-1')
    expect(result.prefix).toBe('my')
    expect(result.marker).toBe('bucket-0')
    expect(result.maxKeys).toBe(2)
    expect(result.isTruncated).toBe(true)
    expect(result.nextMarker).toBe('bucket-3')
    expect(result.owner).toEqual({ id: '1234567890', displayName: 'owner-1' })
    expect(result.buckets).toHaveLength(2)
    expect(result.buckets?.[0]).toEqual({
      name: 'my-bucket-1',
      region: 'oss-cn-hangzhou',
      location: 'oss-cn-hangzhou',
      storageClass: 'Standard',
      extranetEndpoint: 'oss-cn-hangzhou.aliyuncs.com',
      intranetEndpoint: 'oss-cn-hangzhou-internal.aliyuncs.com',
      creationDate: new Date('2022-12-28T10:27:41.000Z'),
    })
    expect(result.buckets?.[1]).toEqual({
      name: 'my-bucket-2',
      region: 'oss-cn-shanghai',
      location: undefined,
      storageClass: 'IA',
      extranetEndpoint: undefined,
      intranetEndpoint: undefined,
      creationDate: undefined,
    })
  })

  it('leaves buckets undefined when the container is empty', async () => {
    const command = new ListBuckets()
    const result = await command.deserialize(output(EMPTY_BUCKETS))

    expect(result.buckets).toBeUndefined()
    expect(result.isTruncated).toBe(false)
  })

  it('rejects a body that is not a ListAllMyBucketsResult', async () => {
    const command = new ListBuckets()
    await expect(command.deserialize(output('<Error><Code>AccessDenied</Code></Error>'))).rejects.toThrow(
      'expected element type <ListAllMyBucketsResult> but have <Error>',
    )
  })
})

const REGIONS = `<?xml version="1.0" encoding="UTF-8"?>
<RegionInfoList>
  <RegionInfo>
    <Region>oss-cn-hangzhou</Region>
    <InternetEndpoint>oss-cn-hangzhou.aliyuncs.com</InternetEndpoint>
    <InternalEndpoint>oss-cn-hangzhou-internal.aliyuncs.com</InternalEndpoint>
    <AccelerateEndpoint>oss-accelerate.aliyuncs.com</AccelerateEndpoint>
  </RegionInfo>
  <RegionInfo>
    <Region>oss-cn-shanghai</Region>
    <InternetEndpoint>oss-cn-shanghai.aliyuncs.com</InternetEndpoint>
    <InternalEndpoint>oss-cn-shanghai-internal.aliyuncs.com</InternalEndpoint>
    <AccelerateEndpoint>oss-accelerate.aliyuncs.com</AccelerateEndpoint>
  </RegionInfo>
</RegionInfoList>`

describe('DescribeRegions serialize', () => {
  it('sends the empty regions sub-resource by default', async () => {
    const command = new DescribeRegions()
    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('DescribeRegions')
    expect(serialized.method).toBe('GET')
    expect(serialized.bucket).toBeUndefined()
    expect(serialized.parameters).toEqual({ regions: '' })
    expect(headersOf(serialized)).toEqual({ 'Content-MD5': EMPTY_BODY_MD5 })
  })

  it('carries a single region id in the sub-resource value', async () => {
    const command = new DescribeRegions({ regions: 'oss-cn-hangzhou' })
    const serialized = await command.serialize(command.input)
    expect(serialized.parameters).toEqual({ regions: 'oss-cn-hangzhou' })
  })
})

describe('DescribeRegions deserialize', () => {
  it('reads every RegionInfo', async () => {
    const command = new DescribeRegions()
    const result = await command.deserialize(output(REGIONS))

    expect(result.regionInfo).toHaveLength(2)
    expect(result.regionInfo?.[0]).toEqual({
      region: 'oss-cn-hangzhou',
      internetEndpoint: 'oss-cn-hangzhou.aliyuncs.com',
      internalEndpoint: 'oss-cn-hangzhou-internal.aliyuncs.com',
      accelerateEndpoint: 'oss-accelerate.aliyuncs.com',
    })
  })

  it('leaves regionInfo undefined for an empty list', async () => {
    const command = new DescribeRegions()
    const result = await command.deserialize(output('<RegionInfoList></RegionInfoList>'))
    expect(result.regionInfo).toBeUndefined()
  })

  it('wraps a body that is not XML, keeping the parser error as the cause', async () => {
    const command = new DescribeRegions()
    const err: unknown = await command.deserialize(output('not xml at all')).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DeserializationError)
    expect((err as DeserializationError).cause?.message).toContain('xml:')
  })
})

describe('opName', () => {
  it('names the same operation on the class as in the envelope', async () => {
    const list = new ListBuckets()
    const regions = new DescribeRegions()
    expect((await list.serialize(list.input)).opName).toBe(list.opName)
    expect((await regions.serialize(regions.input)).opName).toBe(regions.opName)
  })
})
