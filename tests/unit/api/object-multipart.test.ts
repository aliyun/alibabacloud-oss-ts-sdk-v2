import { describe, expect, it } from 'vitest'
import {
  AbortMultipartUpload,
  CompleteMultipartUpload,
  InitiateMultipartUpload,
  ListMultipartUploads,
  ListParts,
  UploadPart,
  UploadPartCopy,
} from '../../../src/api/object-multipart.js'
import { DeserializationError, ParamRequiredError } from '../../../src/error/types.js'
import type { ResponseBody } from '../../../src/transport/types.js'
import type { OperationInput, OperationOutput } from '../../../src/types.js'
import { SpyBody, textBody } from '../../fixtures/mock-transport.js'
import { headersOf } from '../../fixtures/serialized-headers.js'

const input: OperationInput = { opName: 'Test', method: 'GET' }

function output(headers: Record<string, string>, body?: ResponseBody, statusCode = 200): OperationOutput {
  return { input, status: 'OK', statusCode, headers, body }
}

describe('InitiateMultipartUpload serialize', () => {
  it('maps every modelled field to its wire name', async () => {
    const command = new InitiateMultipartUpload({
      bucket: 'bucket-1',
      key: 'dir/file.txt',
      storageClass: 'IA',
      forbidOverwrite: true,
      tagging: 'k=v',
      serverSideEncryption: 'KMS',
      serverSideDataEncryption: 'SM4',
      serverSideEncryptionKeyId: 'key-id',
      cacheControl: 'no-cache',
      contentDisposition: 'attachment',
      contentEncoding: 'gzip',
      contentType: 'application/custom',
      expires: 'Wed, 28 Dec 2022 10:27:41 GMT',
      metadata: { author: 'alice' },
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('InitiateMultipartUpload')
    expect(serialized.method).toBe('POST')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.key).toBe('dir/file.txt')
    expect(serialized.parameters).toEqual({ uploads: '', 'encoding-type': 'url' })
    expect(headersOf(serialized)).toEqual({
      'x-oss-forbid-overwrite': 'true',
      'x-oss-storage-class': 'IA',
      'x-oss-tagging': 'k=v',
      'x-oss-server-side-encryption': 'KMS',
      'x-oss-server-side-data-encryption': 'SM4',
      'x-oss-server-side-encryption-key-id': 'key-id',
      'Cache-Control': 'no-cache',
      'Content-Disposition': 'attachment',
      'Content-Encoding': 'gzip',
      'Content-Type': 'application/custom',
      Expires: 'Wed, 28 Dec 2022 10:27:41 GMT',
      'Content-MD5': '1B2M2Y8AsgTpgAmY7PhCfg==',
      'x-oss-meta-author': 'alice',
    })
  })

  it('marks a missing Content-Type for deferred detection', async () => {
    const command = new InitiateMultipartUpload({ bucket: 'bucket-1', key: 'image.webp' })
    const serialized = await command.serialize(command.input)
    expect(headersOf(serialized)).toEqual({ 'Content-MD5': '1B2M2Y8AsgTpgAmY7PhCfg==' })
    expect(serialized.opMetadata).toEqual({ detect_content_type: true })
    expect(serialized.parameters).toEqual({ uploads: '', 'encoding-type': 'url' })
  })

  it('rejects a missing bucket or key by name', () => {
    const noBucket = new InitiateMultipartUpload({ key: 'k' })
    expect(() => noBucket.serialize(noBucket.input)).toThrow(ParamRequiredError)
    expect(() => noBucket.serialize(noBucket.input)).toThrow('missing required field, bucket')

    const noKey = new InitiateMultipartUpload({ bucket: 'bucket-1' })
    expect(() => noKey.serialize(noKey.input)).toThrow('missing required field, key')
  })
})

describe('InitiateMultipartUpload deserialize', () => {
  it('reads the upload id and url-decodes the key', async () => {
    const command = new InitiateMultipartUpload({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(
      output(
        { 'x-oss-request-id': 'req-1' },
        textBody(
          '<?xml version="1.0" encoding="UTF-8"?><InitiateMultipartUploadResult>' +
            '<Bucket>bucket-1</Bucket><Key>dir%2Ffile.txt</Key><UploadId>upload-1</UploadId>' +
            '<EncodingType>url</EncodingType></InitiateMultipartUploadResult>',
        ),
      ),
    )

    expect(result.requestId).toBe('req-1')
    expect(result.bucket).toBe('bucket-1')
    expect(result.key).toBe('dir/file.txt')
    expect(result.uploadId).toBe('upload-1')
    expect(result.encodingType).toBe('url')
  })

  it('rejects a foreign root element', async () => {
    const command = new InitiateMultipartUpload({ bucket: 'bucket-1', key: 'k' })
    await expect(command.deserialize(output({}, textBody('<Other/>')))).rejects.toThrow(DeserializationError)
  })
})

describe('UploadPart serialize', () => {
  it('carries the part number and upload id in the query and passes the body through', async () => {
    const command = new UploadPart({
      bucket: 'bucket-1',
      key: 'dir/file.txt',
      uploadId: 'upload-1',
      partNumber: 3,
      body: 'part-data',
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('UploadPart')
    expect(serialized.method).toBe('PUT')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.key).toBe('dir/file.txt')
    expect(serialized.parameters).toEqual({ partNumber: '3', uploadId: 'upload-1' })
    expect(headersOf(serialized)).toEqual({})
    expect(serialized.body).toBe('part-data')
  })

  it('rejects a missing upload id or part number by name', () => {
    const noUploadId = new UploadPart({ bucket: 'bucket-1', key: 'k', partNumber: 1 })
    expect(() => noUploadId.serialize(noUploadId.input)).toThrow('missing required field, uploadId')

    const noPartNumber = new UploadPart({ bucket: 'bucket-1', key: 'k', uploadId: 'u' })
    expect(() => noPartNumber.serialize(noPartNumber.input)).toThrow('missing required field, partNumber')
  })
})

describe('UploadPart deserialize', () => {
  it('lifts the etag and crc from the headers and drains the body', async () => {
    const body = new SpyBody()
    const command = new UploadPart({ bucket: 'bucket-1', key: 'k', uploadId: 'u', partNumber: 1 })
    const result = await command.deserialize(
      output({ ETag: '"etag-1"', 'x-oss-hash-crc64ecma': '123' }, body),
    )
    expect(result.etag).toBe('"etag-1"')
    expect(result.hashCrc64ecma).toBe('123')
    expect(body.reads).toBe(1)
  })
})

describe('CompleteMultipartUpload serialize', () => {
  it('builds the part list body and signs its MD5', async () => {
    const command = new CompleteMultipartUpload({
      bucket: 'bucket-1',
      key: 'dir/file.txt',
      uploadId: 'upload-1',
      parts: [
        { etag: 'etag1', partNumber: 1 },
        { etag: 'etag2', partNumber: 2 },
      ],
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('CompleteMultipartUpload')
    expect(serialized.method).toBe('POST')
    expect(serialized.parameters).toEqual({ uploadId: 'upload-1', 'encoding-type': 'url' })
    expect(serialized.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload>' +
        '<Part><ETag>etag1</ETag><PartNumber>1</PartNumber></Part>' +
        '<Part><ETag>etag2</ETag><PartNumber>2</PartNumber></Part></CompleteMultipartUpload>',
    )
    expect(headersOf(serialized)).toEqual({
      'Content-Type': 'application/xml',
      'Content-MD5': 'NsSVaFTE2RDasY6KYUIKmQ==',
    })
  })

  it('sends the complete-all header and an empty-body MD5 when no parts are given', async () => {
    const command = new CompleteMultipartUpload({
      bucket: 'bucket-1',
      key: 'k',
      uploadId: 'upload-1',
      completeAll: 'yes',
      forbidOverwrite: true,
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.body).toBeUndefined()
    expect(headersOf(serialized)).toEqual({
      'x-oss-forbid-overwrite': 'true',
      'x-oss-complete-all': 'yes',
      'Content-Type': 'application/xml',
      'Content-MD5': '1B2M2Y8AsgTpgAmY7PhCfg==',
    })
  })

  it('rejects a missing upload id by name', () => {
    const command = new CompleteMultipartUpload({ bucket: 'bucket-1', key: 'k' })
    expect(() => command.serialize(command.input)).toThrow('missing required field, uploadId')
  })

  it('passes the callback headers through verbatim', async () => {
    const command = new CompleteMultipartUpload({
      bucket: 'bucket-1',
      key: 'k',
      uploadId: 'u',
      completeAll: 'yes',
      callback: 'eyJjYWxsYmFja1VybCI6Imh0dHA6Ly9leGFtcGxlLmNvbSJ9',
      callbackVar: 'eyJ4OnZhciI6InYifQ==',
    })

    const serialized = await command.serialize(command.input)

    expect(headersOf(serialized)['x-oss-callback']).toBe('eyJjYWxsYmFja1VybCI6Imh0dHA6Ly9leGFtcGxlLmNvbSJ9')
    expect(headersOf(serialized)['x-oss-callback-var']).toBe('eyJ4OnZhciI6InYifQ==')
  })
})

describe('CompleteMultipartUpload deserialize', () => {
  it('reads the assembled object fields and the crc header', async () => {
    const command = new CompleteMultipartUpload({ bucket: 'bucket-1', key: 'k', uploadId: 'u' })
    const result = await command.deserialize(
      output(
        { 'x-oss-version-id': 'v1', 'x-oss-hash-crc64ecma': '123' },
        textBody(
          '<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUploadResult>' +
            '<Location>http://bucket-1.oss.example/dir%2Ffile.txt</Location><Bucket>bucket-1</Bucket>' +
            '<Key>dir%2Ffile.txt</Key><ETag>"final-etag"</ETag><EncodingType>url</EncodingType>' +
            '</CompleteMultipartUploadResult>',
        ),
      ),
    )

    expect(result.location).toBe('http://bucket-1.oss.example/dir%2Ffile.txt')
    expect(result.bucket).toBe('bucket-1')
    expect(result.key).toBe('dir/file.txt')
    expect(result.etag).toBe('"final-etag"')
    expect(result.versionId).toBe('v1')
    expect(result.hashCrc64ecma).toBe('123')
  })

  // With a callback set, the service replaces the Complete XML with the callback server's reply, so
  // the body becomes callbackResult and the XML fields stay absent.
  it('takes the body as callbackResult when a callback was requested', async () => {
    const command = new CompleteMultipartUpload({ bucket: 'bucket-1', key: 'k', uploadId: 'u', callback: 'ey000' })
    const result = await command.deserialize(output({ 'x-oss-version-id': 'v1' }, textBody('{"Status":"OK"}')))

    expect(result.callbackResult).toBe('{"Status":"OK"}')
    expect(result.location).toBeUndefined()
    expect(result.etag).toBeUndefined()
    expect(result.versionId).toBe('v1')
  })
})

describe('UploadPartCopy serialize', () => {
  it('encodes the source into one x-oss-copy-source header', async () => {
    const command = new UploadPartCopy({
      bucket: 'dest',
      key: 'dest-key',
      uploadId: 'upload-1',
      partNumber: 2,
      sourceBucket: 'src',
      sourceKey: 'dir/source.txt',
      sourceVersionId: 'sv1',
      copySourceRange: 'bytes=0-9',
      copySourceIfMatch: '"m"',
      copySourceIfNoneMatch: '"n"',
      copySourceIfModifiedSince: 'Wed, 28 Dec 2022 10:27:41 GMT',
      copySourceIfUnmodifiedSince: 'Thu, 29 Dec 2022 10:27:41 GMT',
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.method).toBe('PUT')
    expect(serialized.parameters).toEqual({ partNumber: '2', uploadId: 'upload-1' })
    expect(headersOf(serialized)).toEqual({
      'x-oss-copy-source': '/src/dir%2Fsource.txt?versionId=sv1',
      'x-oss-copy-source-range': 'bytes=0-9',
      'x-oss-copy-source-if-match': '"m"',
      'x-oss-copy-source-if-none-match': '"n"',
      'x-oss-copy-source-if-modified-since': 'Wed, 28 Dec 2022 10:27:41 GMT',
      'x-oss-copy-source-if-unmodified-since': 'Thu, 29 Dec 2022 10:27:41 GMT',
      'Content-Type': 'application/xml',
      'Content-MD5': '1B2M2Y8AsgTpgAmY7PhCfg==',
    })
  })

  it('defaults the source bucket to the destination bucket', async () => {
    const command = new UploadPartCopy({
      bucket: 'bucket-1',
      key: 'k',
      uploadId: 'u',
      partNumber: 1,
      sourceKey: 'source.txt',
    })
    const serialized = await command.serialize(command.input)
    expect(headersOf(serialized)['x-oss-copy-source']).toBe('/bucket-1/source.txt')
  })

  it('rejects a missing source key by name', () => {
    const command = new UploadPartCopy({ bucket: 'bucket-1', key: 'k', uploadId: 'u', partNumber: 1 })
    expect(() => command.serialize(command.input)).toThrow('missing required field, sourceKey')
  })
})

describe('UploadPartCopy deserialize', () => {
  it('reads the copy result body and the source version header', async () => {
    const command = new UploadPartCopy({
      bucket: 'bucket-1',
      key: 'k',
      uploadId: 'u',
      partNumber: 1,
      sourceKey: 's',
    })
    const result = await command.deserialize(
      output(
        { 'x-oss-copy-source-version-id': 'sv1' },
        textBody(
          '<?xml version="1.0" encoding="UTF-8"?><CopyPartResult>' +
            '<LastModified>2023-01-01T00:00:00.000Z</LastModified><ETag>"part-etag"</ETag></CopyPartResult>',
        ),
      ),
    )

    expect(result.lastModified).toEqual(new Date('2023-01-01T00:00:00.000Z'))
    expect(result.etag).toBe('"part-etag"')
    expect(result.copySourceVersionId).toBe('sv1')
  })

  it('leaves the result fields undefined for an empty body', async () => {
    const command = new UploadPartCopy({
      bucket: 'bucket-1',
      key: 'k',
      uploadId: 'u',
      partNumber: 1,
      sourceKey: 's',
    })
    const result = await command.deserialize(output({}))
    expect(result.lastModified).toBeUndefined()
    expect(result.etag).toBeUndefined()
  })
})

describe('AbortMultipartUpload serialize', () => {
  it('sends the upload id in the query with an empty-body MD5', async () => {
    const command = new AbortMultipartUpload({ bucket: 'bucket-1', key: 'k', uploadId: 'upload-1' })
    const serialized = await command.serialize(command.input)
    expect(serialized.method).toBe('DELETE')
    expect(serialized.parameters).toEqual({ uploadId: 'upload-1' })
    expect(headersOf(serialized)).toEqual({
      'Content-Type': 'application/xml',
      'Content-MD5': '1B2M2Y8AsgTpgAmY7PhCfg==',
    })
  })

  it('rejects a missing upload id by name', () => {
    const command = new AbortMultipartUpload({ bucket: 'bucket-1', key: 'k' })
    expect(() => command.serialize(command.input)).toThrow('missing required field, uploadId')
  })
})

describe('AbortMultipartUpload deserialize', () => {
  it('returns the common fields and drains the body', async () => {
    const body = new SpyBody()
    const command = new AbortMultipartUpload({ bucket: 'bucket-1', key: 'k', uploadId: 'u' })
    const result = await command.deserialize(output({ 'x-oss-request-id': 'req-1' }, body, 204))
    expect(result.statusCode).toBe(204)
    expect(result.requestId).toBe('req-1')
    expect(body.reads).toBe(1)
  })
})

describe('ListMultipartUploads serialize', () => {
  it('maps the paging fields to their wire names', async () => {
    const command = new ListMultipartUploads({
      bucket: 'bucket-1',
      delimiter: '/',
      maxUploads: 100,
      keyMarker: 'k-marker',
      prefix: 'photos/',
      uploadIdMarker: 'u-marker',
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.method).toBe('GET')
    expect(serialized.parameters).toEqual({
      uploads: '',
      'encoding-type': 'url',
      delimiter: '/',
      'max-uploads': '100',
      'key-marker': 'k-marker',
      prefix: 'photos/',
      'upload-id-marker': 'u-marker',
    })
  })
})

describe('ListMultipartUploads deserialize', () => {
  it('reads the uploads and url-decodes the markers', async () => {
    const command = new ListMultipartUploads({ bucket: 'bucket-1' })
    const result = await command.deserialize(
      output(
        {},
        textBody(
          '<?xml version="1.0" encoding="UTF-8"?><ListMultipartUploadsResult>' +
            '<Bucket>bucket-1</Bucket><KeyMarker>photos%2F</KeyMarker><NextKeyMarker>photos%2Fb</NextKeyMarker>' +
            '<MaxUploads>1000</MaxUploads><IsTruncated>true</IsTruncated><EncodingType>url</EncodingType>' +
            '<Upload><Key>photos%2Fa.jpg</Key><UploadId>u1</UploadId><Initiated>2023-01-01T00:00:00.000Z</Initiated></Upload>' +
            '</ListMultipartUploadsResult>',
        ),
      ),
    )

    expect(result.bucket).toBe('bucket-1')
    expect(result.keyMarker).toBe('photos/')
    expect(result.nextKeyMarker).toBe('photos/b')
    expect(result.maxUploads).toBe(1000)
    expect(result.isTruncated).toBe(true)
    expect(result.uploads).toEqual([{ key: 'photos/a.jpg', uploadId: 'u1', initiated: '2023-01-01T00:00:00.000Z' }])
  })

  it('leaves uploads undefined when the listing is empty', async () => {
    const command = new ListMultipartUploads({ bucket: 'bucket-1' })
    const result = await command.deserialize(
      output(
        {},
        textBody(
          '<?xml version="1.0" encoding="UTF-8"?><ListMultipartUploadsResult>' +
            '<Bucket>bucket-1</Bucket><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>',
        ),
      ),
    )
    expect(result.uploads).toBeUndefined()
  })
})

describe('ListParts serialize', () => {
  it('maps the paging fields to their wire names', async () => {
    const command = new ListParts({
      bucket: 'bucket-1',
      key: 'dir/file.txt',
      uploadId: 'upload-1',
      maxParts: 50,
      partNumberMarker: 2,
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.method).toBe('GET')
    expect(serialized.parameters).toEqual({
      'encoding-type': 'url',
      uploadId: 'upload-1',
      'max-parts': '50',
      'part-number-marker': '2',
    })
  })

  it('rejects a missing upload id by name', () => {
    const command = new ListParts({ bucket: 'bucket-1', key: 'k' })
    expect(() => command.serialize(command.input)).toThrow('missing required field, uploadId')
  })
})

describe('ListParts deserialize', () => {
  it('reads the parts and the paging markers', async () => {
    const command = new ListParts({ bucket: 'bucket-1', key: 'k', uploadId: 'u' })
    const result = await command.deserialize(
      output(
        {},
        textBody(
          '<?xml version="1.0" encoding="UTF-8"?><ListPartsResult>' +
            '<Bucket>bucket-1</Bucket><Key>dir%2Ffile.txt</Key><UploadId>upload-1</UploadId>' +
            '<PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>2</NextPartNumberMarker>' +
            '<MaxParts>1000</MaxParts><IsTruncated>false</IsTruncated><EncodingType>url</EncodingType>' +
            '<Part><PartNumber>1</PartNumber><ETag>"e1"</ETag><Size>1024</Size>' +
            '<LastModified>2023-01-01T00:00:00.000Z</LastModified></Part></ListPartsResult>',
        ),
      ),
    )

    expect(result.bucket).toBe('bucket-1')
    expect(result.key).toBe('dir/file.txt')
    expect(result.uploadId).toBe('upload-1')
    expect(result.nextPartNumberMarker).toBe(2)
    expect(result.isTruncated).toBe(false)
    expect(result.parts).toEqual([
      { partNumber: 1, etag: '"e1"', size: 1024, lastModified: new Date('2023-01-01T00:00:00.000Z') },
    ])
  })
})
