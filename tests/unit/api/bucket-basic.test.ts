import { describe, expect, it } from 'vitest'
import {
  DeleteBucket,
  GetBucketInfo,
  GetBucketLocation,
  GetBucketStat,
  ListObjects,
  ListObjectsV2,
  PutBucket,
} from '../../../src/api/bucket-basic.js'
import { DeserializationError, ParamRequiredError } from '../../../src/error/types.js'
import type { ResponseBody } from '../../../src/transport/types.js'
import type { OperationOutput } from '../../../src/types.js'
import { SpyBody, textBody } from '../../fixtures/mock-transport.js'
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

const FULL_PAGE = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Name>bucket-1</Name>
  <Prefix>dir%2F</Prefix>
  <StartAfter>dir%2Fa.txt</StartAfter>
  <MaxKeys>2</MaxKeys>
  <Delimiter>%2F</Delimiter>
  <IsTruncated>true</IsTruncated>
  <NextContinuationToken>CgJiYw--</NextContinuationToken>
  <EncodingType>url</EncodingType>
  <KeyCount>3</KeyCount>
  <Contents>
    <Key>dir%2Fb%20c.txt</Key>
    <Type>Normal</Type>
    <Size>1024</Size>
    <ETag>"5D41402ABC4B2A76B9719D911017C592"</ETag>
    <LastModified>2022-12-28T10:27:41.000Z</LastModified>
    <StorageClass>Standard</StorageClass>
    <Owner>
      <ID>1234567890</ID>
      <DisplayName>owner-1</DisplayName>
    </Owner>
    <TransitionTime>2023-01-05T00:00:00.000Z</TransitionTime>
  </Contents>
  <Contents>
    <Key>dir%2Fd.txt</Key>
    <Size>0</Size>
    <StorageClass>Archive</StorageClass>
    <RestoreInfo>ongoing-request="true"</RestoreInfo>
  </Contents>
  <CommonPrefixes>
    <Prefix>dir%2Fsub%2F</Prefix>
  </CommonPrefixes>
</ListBucketResult>`

const EMPTY_PAGE = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Name>bucket-1</Name>
  <MaxKeys>100</MaxKeys>
  <IsTruncated>false</IsTruncated>
  <EncodingType>url</EncodingType>
  <KeyCount>0</KeyCount>
</ListBucketResult>`

// The md5 of no bytes.
const EMPTY_BODY_MD5 = '1B2M2Y8AsgTpgAmY7PhCfg=='

describe('ListObjectsV2 serialize', () => {
  it('always sends list-type and encoding-type, and Content-MD5 but no Content-Type', async () => {
    const command = new ListObjectsV2({ bucket: 'bucket-1' })
    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('ListObjectsV2')
    expect(serialized.method).toBe('GET')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.key).toBeUndefined()
    expect(serialized.parameters).toEqual({ 'list-type': '2', 'encoding-type': 'url' })
    expect(headersOf(serialized)).toEqual({ 'Content-MD5': EMPTY_BODY_MD5 })
  })

  it('maps every modelled field to a query parameter', async () => {
    const command = new ListObjectsV2({
      bucket: 'bucket-1',
      delimiter: '/',
      startAfter: 'dir/a.txt',
      continuationToken: 'CgJiYw--',
      maxKeys: 200,
      prefix: 'dir/',
      fetchOwner: true,
      requestPayer: 'requester',
    })

    const serialized = await command.serialize(command.input)

    expect(headersOf(serialized)).toEqual({ 'x-oss-request-payer': 'requester', 'Content-MD5': EMPTY_BODY_MD5 })
    expect(serialized.parameters).toEqual({
      'list-type': '2',
      'encoding-type': 'url',
      delimiter: '/',
      'start-after': 'dir/a.txt',
      'continuation-token': 'CgJiYw--',
      'max-keys': '200',
      prefix: 'dir/',
      'fetch-owner': 'true',
    })
  })

  // Write order: fixed parameters, then the caller's escape hatch over them, then modelled fields last.
  it('lets the escape hatch override a fixed parameter and a modelled field override both', async () => {
    const command = new ListObjectsV2({
      bucket: 'bucket-1',
      encodingType: 'url',
      parameters: { 'list-type': '1', 'encoding-type': 'raw', 'x-oss-not-modelled': 'kept' },
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.parameters).toEqual({
      'list-type': '1',
      'encoding-type': 'url',
      'x-oss-not-modelled': 'kept',
    })
  })

  it('lets a caller turn the encoding off with an empty string', async () => {
    const command = new ListObjectsV2({ bucket: 'bucket-1', encodingType: '' })
    const serialized = await command.serialize(command.input)
    expect(serialized.parameters?.['encoding-type']).toBe('')
  })

  // A plain `headers[name] =` would leave both spellings in the record for the signer to choose between.
  it('lets the modelled payer win over the same header set by hand, whatever its case', async () => {
    const command = new ListObjectsV2({
      bucket: 'bucket-1',
      requestPayer: 'requester',
      headers: { 'X-OSS-REQUEST-PAYER': 'stale', 'x-oss-not-modelled': 'kept' },
    })

    const serialized = await command.serialize(command.input)

    expect(headersOf(serialized)).toEqual({
      'x-oss-request-payer': 'requester',
      'x-oss-not-modelled': 'kept',
      'Content-MD5': EMPTY_BODY_MD5,
    })
  })

  it('leaves a Content-MD5 the caller set by hand alone, whatever its case', async () => {
    const command = new ListObjectsV2({ bucket: 'bucket-1', headers: { 'CONTENT-MD5': 'XUFAKrxLKna5cZ2REBfFkg==' } })
    const serialized = await command.serialize(command.input)
    expect(headersOf(serialized)).toEqual({ 'CONTENT-MD5': 'XUFAKrxLKna5cZ2REBfFkg==' })
  })

  // `serialize` is not `async`, so `requireField` throws synchronously and `rejects.toThrow` could not see it.
  it('rejects a missing bucket before it writes any parameter', () => {
    const command = new ListObjectsV2({})
    expect(() => command.serialize(command.input)).toThrow(ParamRequiredError)
    expect(() => command.serialize(command.input)).toThrow('missing required field, bucket')

    const alsoMalformed = new ListObjectsV2({ maxKeys: Number.NaN })
    expect(() => alsoMalformed.serialize(alsoMalformed.input)).toThrow('missing required field, bucket')
  })
})

describe('ListObjectsV2 deserialize', () => {
  it('reads the page-level elements and url-decodes the encoded ones', async () => {
    const command = new ListObjectsV2({ bucket: 'bucket-1' })
    const result = await command.deserialize(output(FULL_PAGE))

    expect(result.requestId).toBe('req-1')
    expect(result.name).toBe('bucket-1')
    expect(result.prefix).toBe('dir/')
    expect(result.startAfter).toBe('dir/a.txt')
    expect(result.maxKeys).toBe(2)
    expect(result.delimiter).toBe('/')
    expect(result.isTruncated).toBe(true)
    expect(result.continuationToken).toBeUndefined()
    expect(result.nextContinuationToken).toBe('CgJiYw--')
    expect(result.encodingType).toBe('url')
    expect(result.keyCount).toBe(3)
  })

  it('reads every Contents element, converting each field to its type', async () => {
    const command = new ListObjectsV2({ bucket: 'bucket-1' })
    const result = await command.deserialize(output(FULL_PAGE))

    expect(result.contents).toHaveLength(2)
    expect(result.contents?.[0]).toEqual({
      key: 'dir/b c.txt',
      type: 'Normal',
      size: 1024,
      etag: '"5D41402ABC4B2A76B9719D911017C592"',
      lastModified: new Date('2022-12-28T10:27:41.000Z'),
      storageClass: 'Standard',
      owner: { id: '1234567890', displayName: 'owner-1' },
      restoreInfo: undefined,
      transitionTime: new Date('2023-01-05T00:00:00.000Z'),
    })
    expect(result.contents?.[1]).toEqual({
      key: 'dir/d.txt',
      type: undefined,
      size: 0,
      etag: undefined,
      lastModified: undefined,
      storageClass: 'Archive',
      owner: undefined,
      restoreInfo: 'ongoing-request="true"',
      transitionTime: undefined,
    })
  })

  it('reads CommonPrefixes', async () => {
    const command = new ListObjectsV2({ bucket: 'bucket-1' })
    const result = await command.deserialize(output(FULL_PAGE))
    expect(result.commonPrefixes).toEqual([{ prefix: 'dir/sub/' }])
  })

  it('leaves contents and commonPrefixes undefined for an empty listing', async () => {
    const command = new ListObjectsV2({ bucket: 'bucket-1' })
    const result = await command.deserialize(output(EMPTY_PAGE))

    expect(result.contents).toBeUndefined()
    expect(result.commonPrefixes).toBeUndefined()
    expect(result.keyCount).toBe(0)
    expect(result.isTruncated).toBe(false)
  })

  it('leaves the values alone when the server did not encode them', async () => {
    const command = new ListObjectsV2({ bucket: 'bucket-1' })
    const result = await command.deserialize(
      output('<ListBucketResult><Prefix>dir%2F</Prefix><Contents><Key>a%2Bb.txt</Key></Contents></ListBucketResult>'),
    )

    expect(result.encodingType).toBeUndefined()
    expect(result.prefix).toBe('dir%2F')
    expect(result.contents?.[0].key).toBe('a%2Bb.txt')
  })

  it('matches EncodingType without regard to case', async () => {
    const command = new ListObjectsV2({ bucket: 'bucket-1' })
    const result = await command.deserialize(
      output('<ListBucketResult><EncodingType>URL</EncodingType><Prefix>dir%2F</Prefix></ListBucketResult>'),
    )

    expect(result.encodingType).toBe('URL')
    expect(result.prefix).toBe('dir/')
  })

  it('decodes an escaped plus without turning a literal one into a space', async () => {
    const command = new ListObjectsV2({ bucket: 'bucket-1' })
    const result = await command.deserialize(
      output(
        '<ListBucketResult><EncodingType>url</EncodingType><Prefix>a%2Bb</Prefix>' +
          '<Contents><Key>c+d%20e.txt</Key></Contents></ListBucketResult>',
      ),
    )

    expect(result.prefix).toBe('a+b')
    expect(result.contents?.[0].key).toBe('c+d e.txt')
  })

  // OSS declares a namespace on this response's root, which is matched by name.
  it('accepts a root carrying a namespace declaration', async () => {
    const command = new ListObjectsV2({ bucket: 'bucket-1' })
    const result = await command.deserialize(
      output(
        '<ListBucketResult xmlns="http://doc.oss-cn-hangzhou.aliyuncs.com">' +
          '<Name>bucket-1</Name><KeyCount>1</KeyCount><EncodingType>url</EncodingType>' +
          '<Contents><Key>dir%2Fa.txt</Key></Contents></ListBucketResult>',
      ),
    )

    expect(result.name).toBe('bucket-1')
    expect(result.keyCount).toBe(1)
    expect(result.contents?.[0].key).toBe('dir/a.txt')
  })

  it('rejects a body that is not a ListBucketResult', async () => {
    const command = new ListObjectsV2({ bucket: 'bucket-1' })
    await expect(command.deserialize(output('<Error><Code>NoSuchBucket</Code></Error>'))).rejects.toThrow(
      'expected element type <ListBucketResult> but have <Error>',
    )
  })

  it('wraps a body that is not XML at all, keeping the parser error as the cause', async () => {
    const command = new ListObjectsV2({ bucket: 'bucket-1' })
    const err: unknown = await command.deserialize(output('not xml at all')).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(DeserializationError)
    expect((err as DeserializationError).cause?.message).toContain('xml:')
  })

  // The guard turns a missing body into an empty string, which the parser rejects, so this is a
  // DeserializationError rather than a TypeError from `.text()` on undefined.
  it('rejects a 200 with no body at all', async () => {
    const command = new ListObjectsV2({ bucket: 'bucket-1' })
    const err: unknown = await command
      .deserialize({ input: { opName: 'Test', method: 'GET' }, status: 'OK', statusCode: 200, headers: {} })
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(DeserializationError)
    expect((err as DeserializationError).cause?.message).toContain('no root element')
  })

  it('rejects a malformed percent-escape rather than returning it raw', async () => {
    const command = new ListObjectsV2({ bucket: 'bucket-1' })
    await expect(
      command.deserialize(
        output('<ListBucketResult><EncodingType>url</EncodingType><Prefix>%ZZ</Prefix></ListBucketResult>'),
      ),
    ).rejects.toThrow(DeserializationError)
  })
})

const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>'

function statusOutput(statusCode: number, status: string, body?: ResponseBody): OperationOutput {
  return {
    input: { opName: 'Test', method: 'PUT' },
    status,
    statusCode,
    headers: { 'X-OSS-Request-Id': 'req-1' },
    body,
  }
}

describe('PutBucket serialize', () => {
  it('sends the XML content type and the empty-body MD5 for a bucket-only request', async () => {
    const command = new PutBucket({ bucket: 'bucket-1' })
    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('PutBucket')
    expect(serialized.method).toBe('PUT')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.key).toBeUndefined()
    expect(headersOf(serialized)).toEqual({ 'Content-Type': 'application/xml', 'Content-MD5': EMPTY_BODY_MD5 })
    expect(serialized.parameters).toEqual({})
    expect(serialized.body).toBeUndefined()
  })

  it('rejects a missing bucket', () => {
    const command = new PutBucket({})
    expect(() => command.serialize(command.input)).toThrow(ParamRequiredError)
    expect(() => command.serialize(command.input)).toThrow('missing required field, bucket')
  })

  it('maps acl and resourceGroupId to their headers', async () => {
    const command = new PutBucket({
      bucket: 'bucket-1',
      acl: 'public-read',
      resourceGroupId: 'rg-aekz****',
    })

    const serialized = await command.serialize(command.input)

    expect(headersOf(serialized)).toEqual({
      'x-oss-acl': 'public-read',
      'x-oss-resource-group-id': 'rg-aekz****',
      'Content-Type': 'application/xml',
      'Content-MD5': EMPTY_BODY_MD5,
    })
  })

  it('writes both configuration children, StorageClass first', async () => {
    const command = new PutBucket({
      bucket: 'bucket-1',
      createBucketConfiguration: { storageClass: 'IA', dataRedundancyType: 'ZRS' },
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.body).toBe(
      XML_DECL +
        '<CreateBucketConfiguration><StorageClass>IA</StorageClass>' +
        '<DataRedundancyType>ZRS</DataRedundancyType></CreateBucketConfiguration>',
    )
  })

  // Expected value covers the whole body including the XML declaration -- what OSS hashes -- computed
  // independently by `openssl md5 -binary | base64` over that exact string.
  it('hashes the configuration body it built, declaration included', async () => {
    const command = new PutBucket({
      bucket: 'bucket-1',
      createBucketConfiguration: { storageClass: 'IA', dataRedundancyType: 'ZRS' },
    })

    const serialized = await command.serialize(command.input)

    expect(headersOf(serialized)).toEqual({
      'Content-Type': 'application/xml',
      'Content-MD5': 'zuCmetKMfHQHzWyoXgr8mQ==',
    })
  })

  it('hashes a shorter configuration to a different value', async () => {
    const command = new PutBucket({ bucket: 'bucket-1', createBucketConfiguration: { dataRedundancyType: 'ZRS' } })
    const serialized = await command.serialize(command.input)
    expect(headersOf(serialized)['Content-MD5']).toBe('BGxV/ZVn3ADJqvhC+EU2Ig==')
  })

  it('sends the empty-body MD5 for a configuration with every field unset', async () => {
    const command = new PutBucket({ bucket: 'bucket-1', createBucketConfiguration: {} })
    const serialized = await command.serialize(command.input)
    expect(headersOf(serialized)['Content-MD5']).toBe(EMPTY_BODY_MD5)
  })

  // OSS answers a stray `<StorageClass/>` with InvalidArgument rather than picking its own default.
  it('omits an element for a field the caller left unset', async () => {
    const command = new PutBucket({
      bucket: 'bucket-1',
      createBucketConfiguration: { dataRedundancyType: 'ZRS' },
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.body).toBe(
      XML_DECL + '<CreateBucketConfiguration><DataRedundancyType>ZRS</DataRedundancyType></CreateBucketConfiguration>',
    )
  })

  it('sends no body for a configuration with every field unset', async () => {
    const command = new PutBucket({ bucket: 'bucket-1', createBucketConfiguration: {} })
    const serialized = await command.serialize(command.input)
    expect(serialized.body).toBeUndefined()
  })

  // Presence, not truthiness: an empty string is a set field and gets an empty element.
  it('emits an empty element for a field the caller set to the empty string', async () => {
    const command = new PutBucket({ bucket: 'bucket-1', createBucketConfiguration: { storageClass: '' } })
    const serialized = await command.serialize(command.input)
    expect(serialized.body).toBe(XML_DECL + '<CreateBucketConfiguration><StorageClass/></CreateBucketConfiguration>')
  })

  // One key, not two: a default beside the caller's spelling would put both on the wire and the V1
  // signer signs whichever comes first.
  it('leaves a content type the caller set by hand alone, under their own spelling', async () => {
    const command = new PutBucket({ bucket: 'bucket-1', headers: { 'content-type': 'application/json' } })
    const serialized = await command.serialize(command.input)
    expect(headersOf(serialized)).toEqual({ 'content-type': 'application/json', 'Content-MD5': EMPTY_BODY_MD5 })
  })

  it('leaves a Content-MD5 the caller set by hand alone, even with a body to hash', async () => {
    const command = new PutBucket({
      bucket: 'bucket-1',
      createBucketConfiguration: { storageClass: 'IA' },
      headers: { 'CONTENT-MD5': 'XUFAKrxLKna5cZ2REBfFkg==' },
    })

    const serialized = await command.serialize(command.input)

    expect(headersOf(serialized)).toEqual({
      'CONTENT-MD5': 'XUFAKrxLKna5cZ2REBfFkg==',
      'Content-Type': 'application/xml',
    })
  })

  it('lets the modelled acl win over the same header set by hand, whatever its case', async () => {
    const command = new PutBucket({
      bucket: 'bucket-1',
      acl: 'private',
      headers: { 'X-OSS-ACL': 'public-read-write', 'x-oss-not-modelled': 'kept' },
    })

    const serialized = await command.serialize(command.input)

    expect(headersOf(serialized)).toEqual({
      'x-oss-acl': 'private',
      'x-oss-not-modelled': 'kept',
      'Content-Type': 'application/xml',
      'Content-MD5': EMPTY_BODY_MD5,
    })
  })

  it('copies the parameter escape hatch through', async () => {
    const command = new PutBucket({ bucket: 'bucket-1', parameters: { 'x-oss-not-modelled': 'kept' } })
    const serialized = await command.serialize(command.input)
    expect(serialized.parameters).toEqual({ 'x-oss-not-modelled': 'kept' })
  })
})

describe('PutBucket deserialize', () => {
  it('reads the common fields, lowercasing the header names, and drains the body', async () => {
    const command = new PutBucket({ bucket: 'bucket-1' })
    const body = new SpyBody()

    const result = await command.deserialize(statusOutput(200, 'OK', body))

    expect(result).toEqual({
      status: 'OK',
      statusCode: 200,
      requestId: 'req-1',
      headers: { 'x-oss-request-id': 'req-1' },
    })
    expect(body.reads).toBe(1)
  })

  it('accepts a response with no body at all', async () => {
    const command = new PutBucket({ bucket: 'bucket-1' })
    const result = await command.deserialize(statusOutput(200, 'OK'))
    expect(result.requestId).toBe('req-1')
  })
})

describe('DeleteBucket serialize', () => {
  it('sends the empty-body MD5 and no other header of its own', async () => {
    const command = new DeleteBucket({ bucket: 'bucket-1' })
    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('DeleteBucket')
    expect(serialized.method).toBe('DELETE')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.key).toBeUndefined()
    expect(headersOf(serialized)).toEqual({ 'Content-MD5': EMPTY_BODY_MD5 })
    expect(serialized.parameters).toEqual({})
    expect(serialized.body).toBeUndefined()
  })

  it('rejects a missing bucket', () => {
    const command = new DeleteBucket({})
    expect(() => command.serialize(command.input)).toThrow(ParamRequiredError)
    expect(() => command.serialize(command.input)).toThrow('missing required field, bucket')
  })

  it('copies both escape hatches through', async () => {
    const command = new DeleteBucket({
      bucket: 'bucket-1',
      headers: { 'x-oss-request-payer': 'requester' },
      parameters: { 'x-oss-not-modelled': 'kept' },
    })

    const serialized = await command.serialize(command.input)

    expect(headersOf(serialized)).toEqual({ 'x-oss-request-payer': 'requester', 'Content-MD5': EMPTY_BODY_MD5 })
    expect(serialized.parameters).toEqual({ 'x-oss-not-modelled': 'kept' })
  })

  it('leaves a Content-MD5 the caller set by hand alone, whatever its case', async () => {
    const command = new DeleteBucket({ bucket: 'bucket-1', headers: { 'Content-Md5': 'XUFAKrxLKna5cZ2REBfFkg==' } })
    const serialized = await command.serialize(command.input)
    expect(headersOf(serialized)).toEqual({ 'Content-Md5': 'XUFAKrxLKna5cZ2REBfFkg==' })
  })
})

describe('DeleteBucket deserialize', () => {
  it('reads a 204 and drains the body', async () => {
    const command = new DeleteBucket({ bucket: 'bucket-1' })
    const body = new SpyBody()

    const result = await command.deserialize(statusOutput(204, 'No Content', body))

    expect(result).toEqual({
      status: 'No Content',
      statusCode: 204,
      requestId: 'req-1',
      headers: { 'x-oss-request-id': 'req-1' },
    })
    expect(body.reads).toBe(1)
  })

  it('accepts a response with no body at all', async () => {
    const command = new DeleteBucket({ bucket: 'bucket-1' })
    const result = await command.deserialize(statusOutput(204, 'No Content'))
    expect(result.statusCode).toBe(204)
  })
})

describe('ListObjects serialize', () => {
  it('sends encoding-type and Content-MD5 but no list-type and no Content-Type', async () => {
    const command = new ListObjects({ bucket: 'bucket-1' })
    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('ListObjects')
    expect(serialized.method).toBe('GET')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.key).toBeUndefined()
    expect(serialized.parameters).toEqual({ 'encoding-type': 'url' })
    expect(headersOf(serialized)).toEqual({ 'Content-MD5': EMPTY_BODY_MD5 })
  })

  it('maps every modelled field to a query parameter, marker not continuation-token', async () => {
    const command = new ListObjects({
      bucket: 'bucket-1',
      delimiter: '/',
      marker: 'dir/a.txt',
      maxKeys: 200,
      prefix: 'dir/',
      requestPayer: 'requester',
    })

    const serialized = await command.serialize(command.input)

    expect(headersOf(serialized)).toEqual({ 'x-oss-request-payer': 'requester', 'Content-MD5': EMPTY_BODY_MD5 })
    expect(serialized.parameters).toEqual({
      'encoding-type': 'url',
      delimiter: '/',
      marker: 'dir/a.txt',
      'max-keys': '200',
      prefix: 'dir/',
    })
  })

  it('rejects a missing bucket', () => {
    const command = new ListObjects({})
    expect(() => command.serialize(command.input)).toThrow(ParamRequiredError)
    expect(() => command.serialize(command.input)).toThrow('missing required field, bucket')
  })
})

describe('ListObjects deserialize', () => {
  it('reads the page-level elements, marker and next-marker, url-decoding the encoded ones', async () => {
    const command = new ListObjects({ bucket: 'bucket-1' })
    const result = await command.deserialize(
      output(
        '<ListBucketResult><Name>bucket-1</Name><Prefix>dir%2F</Prefix><Marker>dir%2Fa.txt</Marker>' +
          '<MaxKeys>2</MaxKeys><Delimiter>%2F</Delimiter><IsTruncated>true</IsTruncated>' +
          '<NextMarker>dir%2Fz.txt</NextMarker><EncodingType>url</EncodingType>' +
          '<Contents><Key>dir%2Fb%20c.txt</Key><Size>1024</Size></Contents>' +
          '<CommonPrefixes><Prefix>dir%2Fsub%2F</Prefix></CommonPrefixes></ListBucketResult>',
      ),
    )

    expect(result.name).toBe('bucket-1')
    expect(result.prefix).toBe('dir/')
    expect(result.marker).toBe('dir/a.txt')
    expect(result.maxKeys).toBe(2)
    expect(result.delimiter).toBe('/')
    expect(result.isTruncated).toBe(true)
    expect(result.nextMarker).toBe('dir/z.txt')
    expect(result.encodingType).toBe('url')
    expect(result.contents).toEqual([{ key: 'dir/b c.txt', size: 1024 }])
    expect(result.commonPrefixes).toEqual([{ prefix: 'dir/sub/' }])
  })

  it('leaves contents and commonPrefixes undefined for an empty listing', async () => {
    const command = new ListObjects({ bucket: 'bucket-1' })
    const result = await command.deserialize(
      output('<ListBucketResult><Name>bucket-1</Name><IsTruncated>false</IsTruncated></ListBucketResult>'),
    )

    expect(result.contents).toBeUndefined()
    expect(result.commonPrefixes).toBeUndefined()
    expect(result.isTruncated).toBe(false)
  })

  it('rejects a body that is not a ListBucketResult', async () => {
    const command = new ListObjects({ bucket: 'bucket-1' })
    await expect(command.deserialize(output('<Error><Code>NoSuchBucket</Code></Error>'))).rejects.toThrow(
      'expected element type <ListBucketResult> but have <Error>',
    )
  })
})

describe('GetBucketInfo serialize', () => {
  it('sends a bodyless bucketInfo sub-resource GET with the empty-body MD5', async () => {
    const command = new GetBucketInfo({ bucket: 'bucket-1' })
    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('GetBucketInfo')
    expect(serialized.method).toBe('GET')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.parameters).toEqual({ bucketInfo: '' })
    expect(headersOf(serialized)).toEqual({ 'Content-MD5': EMPTY_BODY_MD5 })
    expect(serialized.body).toBeUndefined()
  })

  it('rejects a missing bucket', () => {
    const command = new GetBucketInfo({})
    expect(() => command.serialize(command.input)).toThrow('missing required field, bucket')
  })
})

describe('GetBucketInfo deserialize', () => {
  it('reads the bucket container, including its owner, ACL, encryption and policy', async () => {
    const command = new GetBucketInfo({ bucket: 'bucket-1' })
    const result = await command.deserialize(
      output(
        '<BucketInfo><Bucket><Location>oss-cn-hangzhou</Location><Name>bucket-1</Name>' +
          '<StorageClass>Standard</StorageClass><DataRedundancyType>LRS</DataRedundancyType>' +
          '<CreationDate>2013-07-31T10:56:21.000Z</CreationDate>' +
          '<ExtranetEndpoint>oss-cn-hangzhou.aliyuncs.com</ExtranetEndpoint>' +
          '<IntranetEndpoint>oss-cn-hangzhou-internal.aliyuncs.com</IntranetEndpoint>' +
          '<Comment>a bucket</Comment><BlockPublicAccess>true</BlockPublicAccess>' +
          '<Versioning>Enabled</Versioning>' +
          '<Owner><ID>1234</ID><DisplayName>owner-1</DisplayName></Owner>' +
          '<AccessControlList><Grant>private</Grant></AccessControlList>' +
          '<ServerSideEncryptionRule><SSEAlgorithm>KMS</SSEAlgorithm>' +
          '<KMSMasterKeyID>key-1</KMSMasterKeyID><KMSDataEncryption>SM4</KMSDataEncryption>' +
          '</ServerSideEncryptionRule>' +
          '<BucketPolicy><LogBucket>log-bucket</LogBucket><LogPrefix>logs/</LogPrefix></BucketPolicy>' +
          '</Bucket></BucketInfo>',
      ),
    )

    expect(result.bucketInfo).toEqual({
      location: 'oss-cn-hangzhou',
      name: 'bucket-1',
      storageClass: 'Standard',
      dataRedundancyType: 'LRS',
      creationDate: '2013-07-31T10:56:21.000Z',
      extranetEndpoint: 'oss-cn-hangzhou.aliyuncs.com',
      intranetEndpoint: 'oss-cn-hangzhou-internal.aliyuncs.com',
      comment: 'a bucket',
      owner: { id: '1234', displayName: 'owner-1' },
      transferAcceleration: undefined,
      accessMonitor: undefined,
      resourceGroupId: undefined,
      accessControlList: { grant: 'private' },
      blockPublicAccess: true,
      crossRegionReplication: undefined,
      serverSideEncryptionRule: { sseAlgorithm: 'KMS', kmsMasterKeyId: 'key-1', kmsDataEncryption: 'SM4' },
      bucketPolicy: { logBucket: 'log-bucket', logPrefix: 'logs/' },
      versioning: 'Enabled',
      bucketResourceType: undefined,
      agenticBucketName: undefined,
    })
  })

  it('leaves nested containers undefined when the bucket omits them', async () => {
    const command = new GetBucketInfo({ bucket: 'bucket-1' })
    const result = await command.deserialize(output('<BucketInfo><Bucket><Name>bucket-1</Name></Bucket></BucketInfo>'))

    expect(result.bucketInfo?.name).toBe('bucket-1')
    expect(result.bucketInfo?.owner).toBeUndefined()
    expect(result.bucketInfo?.accessControlList).toBeUndefined()
    expect(result.bucketInfo?.serverSideEncryptionRule).toBeUndefined()
    expect(result.bucketInfo?.bucketPolicy).toBeUndefined()
  })

  it('leaves bucketInfo undefined when the root carries no Bucket child', async () => {
    const command = new GetBucketInfo({ bucket: 'bucket-1' })
    const result = await command.deserialize(output('<BucketInfo></BucketInfo>'))
    expect(result.bucketInfo).toBeUndefined()
  })

  it('rejects a body that is not a BucketInfo', async () => {
    const command = new GetBucketInfo({ bucket: 'bucket-1' })
    await expect(command.deserialize(output('<Error><Code>NoSuchBucket</Code></Error>'))).rejects.toThrow(
      'expected element type <BucketInfo> but have <Error>',
    )
  })
})

describe('GetBucketLocation serialize', () => {
  it('sends a bodyless location sub-resource GET', async () => {
    const command = new GetBucketLocation({ bucket: 'bucket-1' })
    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('GetBucketLocation')
    expect(serialized.method).toBe('GET')
    expect(serialized.parameters).toEqual({ location: '' })
    expect(headersOf(serialized)).toEqual({ 'Content-MD5': EMPTY_BODY_MD5 })
  })

  it('rejects a missing bucket', () => {
    const command = new GetBucketLocation({})
    expect(() => command.serialize(command.input)).toThrow('missing required field, bucket')
  })
})

describe('GetBucketLocation deserialize', () => {
  it('reads the region from the root element text', async () => {
    const command = new GetBucketLocation({ bucket: 'bucket-1' })
    const result = await command.deserialize(output('<LocationConstraint>oss-cn-hangzhou</LocationConstraint>'))
    expect(result.locationConstraint).toBe('oss-cn-hangzhou')
  })

  it('leaves the region undefined when the element is empty', async () => {
    const command = new GetBucketLocation({ bucket: 'bucket-1' })
    const result = await command.deserialize(output('<LocationConstraint></LocationConstraint>'))
    expect(result.locationConstraint).toBeUndefined()
  })

  it('rejects a body that is not a LocationConstraint', async () => {
    const command = new GetBucketLocation({ bucket: 'bucket-1' })
    await expect(command.deserialize(output('<Error><Code>NoSuchBucket</Code></Error>'))).rejects.toThrow(
      'expected element type <LocationConstraint> but have <Error>',
    )
  })
})

describe('GetBucketStat serialize', () => {
  it('sends a bodyless stat sub-resource GET', async () => {
    const command = new GetBucketStat({ bucket: 'bucket-1' })
    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('GetBucketStat')
    expect(serialized.method).toBe('GET')
    expect(serialized.parameters).toEqual({ stat: '' })
    expect(headersOf(serialized)).toEqual({ 'Content-MD5': EMPTY_BODY_MD5 })
  })

  it('rejects a missing bucket', () => {
    const command = new GetBucketStat({})
    expect(() => command.serialize(command.input)).toThrow('missing required field, bucket')
  })
})

describe('GetBucketStat deserialize', () => {
  it('converts each reported field to a number, including the timestamp', async () => {
    const command = new GetBucketStat({ bucket: 'bucket-1' })
    const result = await command.deserialize(
      output(
        '<BucketStat><Storage>1600</Storage><ObjectCount>230</ObjectCount>' +
          '<MultipartUploadCount>40</MultipartUploadCount><LiveChannelCount>4</LiveChannelCount>' +
          '<LastModifiedTime>1643341269</LastModifiedTime><StandardStorage>430</StandardStorage>' +
          '<ArchiveObjectCount>7</ArchiveObjectCount><DeleteMarkerCount>2</DeleteMarkerCount></BucketStat>',
      ),
    )

    expect(result.bucketStat?.storage).toBe(1600)
    expect(result.bucketStat?.objectCount).toBe(230)
    expect(result.bucketStat?.multipartUploadCount).toBe(40)
    expect(result.bucketStat?.liveChannelCount).toBe(4)
    expect(result.bucketStat?.lastModifiedTime).toBe(1643341269)
    expect(result.bucketStat?.standardStorage).toBe(430)
    expect(result.bucketStat?.archiveObjectCount).toBe(7)
    expect(result.bucketStat?.deleteMarkerCount).toBe(2)
    expect(result.bucketStat?.coldArchiveStorage).toBeUndefined()
  })

  it('rejects a body that is not a BucketStat', async () => {
    const command = new GetBucketStat({ bucket: 'bucket-1' })
    await expect(command.deserialize(output('<Error><Code>NoSuchBucket</Code></Error>'))).rejects.toThrow(
      'expected element type <BucketStat> but have <Error>',
    )
  })
})

// Each operation names itself twice: on the class (read to report a serializer that threw) and in
// the envelope (the only name the raw `invokeOperation` path has). This pins the two together.
describe('opName', () => {
  it('names the same operation on the class as in the envelope', async () => {
    const list = new ListObjectsV2({ bucket: 'bucket-1' })
    const put = new PutBucket({ bucket: 'bucket-1' })
    const remove = new DeleteBucket({ bucket: 'bucket-1' })

    expect((await list.serialize(list.input)).opName).toBe(list.opName)
    expect((await put.serialize(put.input)).opName).toBe(put.opName)
    expect((await remove.serialize(remove.input)).opName).toBe(remove.opName)
  })

  it('names the sub-resource reads the same on the class as in the envelope', async () => {
    const info = new GetBucketInfo({ bucket: 'bucket-1' })
    const location = new GetBucketLocation({ bucket: 'bucket-1' })
    const stat = new GetBucketStat({ bucket: 'bucket-1' })
    const listV1 = new ListObjects({ bucket: 'bucket-1' })

    expect((await info.serialize(info.input)).opName).toBe(info.opName)
    expect((await location.serialize(location.input)).opName).toBe(location.opName)
    expect((await stat.serialize(stat.input)).opName).toBe(stat.opName)
    expect((await listV1.serialize(listV1.input)).opName).toBe(listV1.opName)
  })
})
