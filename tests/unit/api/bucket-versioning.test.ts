import { describe, expect, it } from 'vitest'
import {
  GetBucketVersioning,
  ListObjectVersions,
  PutBucketVersioning,
} from '../../../src/api/bucket-versioning.js'
import { SpyBody, textBody } from '../../fixtures/mock-transport.js'
import { headersOf } from '../../fixtures/serialized-headers.js'
import type { OperationOutput } from '../../../src/types.js'

const EMPTY_BODY_MD5 = '1B2M2Y8AsgTpgAmY7PhCfg=='

function output(body: string): OperationOutput {
  return {
    input: { opName: 'Test', method: 'GET' },
    status: 'OK',
    statusCode: 200,
    headers: { 'x-oss-request-id': 'req-1' },
    body: textBody(body),
  }
}

describe('PutBucketVersioning serialize', () => {
  it('sends the configuration body, the versioning sub-resource, the XML content type and the body MD5', async () => {
    const command = new PutBucketVersioning({ bucket: 'bucket-1', versioningConfiguration: { status: 'Enabled' } })
    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('PutBucketVersioning')
    expect(serialized.method).toBe('PUT')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.parameters).toEqual({ versioning: '' })
    expect(serialized.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>',
    )
    expect(headersOf(serialized)['Content-Type']).toBe('application/xml')
    expect(headersOf(serialized)['Content-MD5']).toBe('pTHEL28uQ7ad2DUkOu4xtw==')
  })

  it('sends the empty-body MD5 when no configuration is set, so the request carries no body', async () => {
    const command = new PutBucketVersioning({ bucket: 'bucket-1' })
    const serialized = await command.serialize(command.input)

    expect(serialized.body).toBeUndefined()
    expect(headersOf(serialized)['Content-MD5']).toBe(EMPTY_BODY_MD5)
  })

  it('rejects a missing bucket', () => {
    const command = new PutBucketVersioning({ versioningConfiguration: { status: 'Enabled' } })
    expect(() => command.serialize(command.input)).toThrow('missing required field, bucket')
  })
})

describe('PutBucketVersioning deserialize', () => {
  it('reads the common fields and drains the body', async () => {
    const command = new PutBucketVersioning({ bucket: 'bucket-1' })
    const body = new SpyBody()

    const result = await command.deserialize({
      input: { opName: 'Test', method: 'PUT' },
      status: 'OK',
      statusCode: 200,
      headers: { 'x-oss-request-id': 'req-1' },
      body,
    })

    expect(result).toEqual({ status: 'OK', statusCode: 200, requestId: 'req-1', headers: { 'x-oss-request-id': 'req-1' } })
    expect(body.reads).toBe(1)
  })
})

describe('GetBucketVersioning serialize', () => {
  it('sends a bodyless versioning sub-resource GET with the empty-body MD5', async () => {
    const command = new GetBucketVersioning({ bucket: 'bucket-1' })
    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('GetBucketVersioning')
    expect(serialized.method).toBe('GET')
    expect(serialized.parameters).toEqual({ versioning: '' })
    expect(headersOf(serialized)).toEqual({ 'Content-MD5': EMPTY_BODY_MD5 })
  })
})

describe('GetBucketVersioning deserialize', () => {
  it('reads the versioning status', async () => {
    const command = new GetBucketVersioning({ bucket: 'bucket-1' })
    const result = await command.deserialize(
      output('<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>'),
    )
    expect(result.versioningConfiguration).toEqual({ status: 'Enabled' })
  })

  it('leaves the status undefined when the bucket was never versioned', async () => {
    const command = new GetBucketVersioning({ bucket: 'bucket-1' })
    const result = await command.deserialize(output('<VersioningConfiguration></VersioningConfiguration>'))
    expect(result.versioningConfiguration).toEqual({ status: undefined })
  })

  it('rejects a body that is not a VersioningConfiguration', async () => {
    const command = new GetBucketVersioning({ bucket: 'bucket-1' })
    await expect(command.deserialize(output('<Error><Code>NoSuchBucket</Code></Error>'))).rejects.toThrow(
      'expected element type <VersioningConfiguration> but have <Error>',
    )
  })
})

describe('ListObjectVersions serialize', () => {
  it('fixes the versions sub-resource and url encoding, then folds in the paging parameters', async () => {
    const command = new ListObjectVersions({
      bucket: 'bucket-1',
      prefix: 'a/',
      delimiter: '/',
      keyMarker: 'k',
      versionIdMarker: 'v',
      maxKeys: 50,
    })
    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('ListObjectVersions')
    expect(serialized.method).toBe('GET')
    expect(serialized.parameters).toEqual({
      versions: '',
      'encoding-type': 'url',
      prefix: 'a/',
      delimiter: '/',
      'key-marker': 'k',
      'version-id-marker': 'v',
      'max-keys': '50',
    })
    expect(headersOf(serialized)).toEqual({ 'Content-MD5': EMPTY_BODY_MD5 })
  })

  it('rejects a missing bucket', () => {
    const command = new ListObjectVersions({})
    expect(() => command.serialize(command.input)).toThrow('missing required field, bucket')
  })
})

describe('ListObjectVersions deserialize', () => {
  it('reads versions, delete markers and common prefixes, url-decoding keys but not version ids', async () => {
    const command = new ListObjectVersions({ bucket: 'bucket-1' })
    const result = await command.deserialize(
      output(
        '<ListVersionsResult><Name>bucket-1</Name><Prefix>a%2F</Prefix><KeyMarker>k%20m</KeyMarker>' +
          '<VersionIdMarker>vm</VersionIdMarker><NextKeyMarker>n%20k</NextKeyMarker>' +
          '<NextVersionIdMarker>nv</NextVersionIdMarker><MaxKeys>100</MaxKeys><Delimiter>%2F</Delimiter>' +
          '<IsTruncated>true</IsTruncated><EncodingType>url</EncodingType>' +
          '<Version><Key>a%2Fone.txt</Key><VersionId>id%2F1</VersionId><IsLatest>true</IsLatest>' +
          '<LastModified>2026-01-01T00:00:00.000Z</LastModified><ETag>"E1"</ETag><Size>7</Size>' +
          '<StorageClass>Standard</StorageClass><Owner><ID>1</ID><DisplayName>o</DisplayName></Owner></Version>' +
          '<DeleteMarker><Key>a%2Ftwo.txt</Key><VersionId>id2</VersionId><IsLatest>false</IsLatest>' +
          '<LastModified>2026-01-02T00:00:00.000Z</LastModified></DeleteMarker>' +
          '<CommonPrefixes><Prefix>a%2Fsub%2F</Prefix></CommonPrefixes></ListVersionsResult>',
      ),
    )

    expect(result.name).toBe('bucket-1')
    expect(result.prefix).toBe('a/')
    expect(result.keyMarker).toBe('k m')
    expect(result.versionIdMarker).toBe('vm')
    expect(result.nextKeyMarker).toBe('n k')
    expect(result.nextVersionIdMarker).toBe('nv')
    expect(result.maxKeys).toBe(100)
    expect(result.delimiter).toBe('/')
    expect(result.isTruncated).toBe(true)
    expect(result.versions).toEqual([
      {
        key: 'a/one.txt',
        versionId: 'id%2F1',
        isLatest: true,
        lastModified: new Date('2026-01-01T00:00:00.000Z'),
        etag: '"E1"',
        size: 7,
        storageClass: 'Standard',
        owner: { id: '1', displayName: 'o' },
        restoreInfo: undefined,
      },
    ])
    expect(result.deleteMarkers).toEqual([
      {
        key: 'a/two.txt',
        versionId: 'id2',
        isLatest: false,
        lastModified: new Date('2026-01-02T00:00:00.000Z'),
        owner: undefined,
      },
    ])
    expect(result.commonPrefixes).toEqual([{ prefix: 'a/sub/' }])
  })

  it('leaves the collections undefined when the listing is empty', async () => {
    const command = new ListObjectVersions({ bucket: 'bucket-1' })
    const result = await command.deserialize(output('<ListVersionsResult><Name>bucket-1</Name></ListVersionsResult>'))
    expect(result.versions).toBeUndefined()
    expect(result.deleteMarkers).toBeUndefined()
    expect(result.commonPrefixes).toBeUndefined()
  })

  it('rejects a body that is not a ListVersionsResult', async () => {
    const command = new ListObjectVersions({ bucket: 'bucket-1' })
    await expect(command.deserialize(output('<ListBucketResult></ListBucketResult>'))).rejects.toThrow(
      'expected element type <ListVersionsResult> but have <ListBucketResult>',
    )
  })
})
