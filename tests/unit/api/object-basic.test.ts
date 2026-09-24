import { describe, expect, it } from 'vitest'
import {
  AppendObject,
  CleanRestoredObject,
  CopyObject,
  DeleteMultipleObjects,
  DeleteObject,
  GetObject,
  GetObjectMeta,
  HeadObject,
  PutObject,
  RestoreObject,
} from '../../../src/api/object-basic.js'
import { DeserializationError, ParamRequiredError } from '../../../src/error/types.js'
import type { ResponseBody } from '../../../src/transport/types.js'
import type { OperationInput, OperationOutput } from '../../../src/types.js'
import { SpyBody, textBody } from '../../fixtures/mock-transport.js'
import { headersOf } from '../../fixtures/serialized-headers.js'

const input: OperationInput = { opName: 'Test', method: 'GET' }

function output(headers: Record<string, string>, body?: ResponseBody, statusCode = 200): OperationOutput {
  return { input, status: 'OK', statusCode, headers, body }
}

describe('PutObject serialize', () => {
  it('maps every modelled field to its wire name', async () => {
    const command = new PutObject({
      bucket: 'bucket-1',
      key: 'dir/file.txt',
      body: 'hello',
      cacheControl: 'no-cache',
      contentDisposition: 'attachment',
      contentEncoding: 'gzip',
      contentLength: 5,
      contentMd5: 'XUFAKrxLKna5cZ2REBfFkg==',
      contentType: 'text/plain',
      expires: 'Wed, 28 Dec 2022 10:27:41 GMT',
      forbidOverwrite: true,
      acl: 'private',
      storageClass: 'IA',
      metadata: { author: 'alice' },
      tagging: 'k=v',
      trafficLimit: 8000,
      requestPayer: 'requester',
      callback: 'eyJjYWxsYmFja1VybCI6Imh0dHA6Ly9leGFtcGxlLmNvbSJ9',
      callbackVar: 'eyJ4OnZhciI6InYifQ==',
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('PutObject')
    expect(serialized.method).toBe('PUT')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.key).toBe('dir/file.txt')
    expect(serialized.body).toBe('hello')
    expect(headersOf(serialized)).toEqual({
      'Cache-Control': 'no-cache',
      'Content-Disposition': 'attachment',
      'Content-Encoding': 'gzip',
      'Content-Length': '5',
      'Content-MD5': 'XUFAKrxLKna5cZ2REBfFkg==',
      'Content-Type': 'text/plain',
      Expires: 'Wed, 28 Dec 2022 10:27:41 GMT',
      'x-oss-forbid-overwrite': 'true',
      'x-oss-object-acl': 'private',
      'x-oss-storage-class': 'IA',
      'x-oss-tagging': 'k=v',
      'x-oss-traffic-limit': '8000',
      'x-oss-request-payer': 'requester',
      // Stored verbatim: the caller base64-encodes the callback JSON, and the SDK passes it through.
      'x-oss-callback': 'eyJjYWxsYmFja1VybCI6Imh0dHA6Ly9leGFtcGxlLmNvbSJ9',
      'x-oss-callback-var': 'eyJ4OnZhciI6InYifQ==',
      'x-oss-meta-author': 'alice',
    })
  })

  // No Content-MD5: hashing an upload would buffer a body that may be a stream. A caller who wants
  // one sets `contentMd5`. The actual default Content-Type waits for `ClientImpl`, after it knows the
  // client feature flags and whether this is a sent request.
  it('marks a missing Content-Type for deferred detection', async () => {
    const command = new PutObject({ bucket: 'bucket-1', key: 'k' })
    const serialized = await command.serialize(command.input)
    expect(headersOf(serialized)).toEqual({})
    expect(serialized.opMetadata).toEqual({ detect_content_type: true })
    expect(serialized.parameters).toEqual({})
    expect(serialized.body).toBeUndefined()
  })

  // `serialize` is not `async`, so `requireField` throws synchronously rather than rejecting.
  it('rejects a missing bucket or key by name', () => {
    const noBucket = new PutObject({ key: 'k' })
    expect(() => noBucket.serialize(noBucket.input)).toThrow(ParamRequiredError)
    expect(() => noBucket.serialize(noBucket.input)).toThrow('missing required field, bucket')

    const noKey = new PutObject({ bucket: 'bucket-1' })
    expect(() => noKey.serialize(noKey.input)).toThrow('missing required field, key')
  })

  // Both required checks run before any header is written, so a malformed numeric field alongside a
  // missing bucket still reports the missing bucket.
  it('checks the required fields first, in declaration order', () => {
    const neither = new PutObject({})
    expect(() => neither.serialize(neither.input)).toThrow('missing required field, bucket')

    const alsoMalformed = new PutObject({ key: 'k', contentLength: Number.NaN })
    expect(() => alsoMalformed.serialize(alsoMalformed.input)).toThrow(ParamRequiredError)
    expect(() => alsoMalformed.serialize(alsoMalformed.input)).toThrow('missing required field, bucket')
  })

  it('lets a modelled field win over the same header set by hand, whatever its case', async () => {
    const command = new PutObject({
      bucket: 'bucket-1',
      key: 'k',
      contentType: 'text/plain',
      headers: { 'content-type': 'application/json', 'x-oss-not-modelled': 'kept' },
      parameters: { 'x-oss-process': 'kept' },
    })

    const serialized = await command.serialize(command.input)

    expect(headersOf(serialized)).toEqual({ 'Content-Type': 'text/plain', 'x-oss-not-modelled': 'kept' })
    expect(serialized.parameters).toEqual({ 'x-oss-process': 'kept' })
  })

  it('marks an upload with an extension for deferred Content-Type detection', async () => {
    const command = new PutObject({ bucket: 'bucket-1', key: 'k.png' })

    expect((await command.serialize(command.input)).opMetadata).toEqual({ detect_content_type: true })
  })

  it('leaves a by-hand Content-Type alone under a casing it does not itself use', async () => {
    const command = new PutObject({
      bucket: 'bucket-1',
      key: 'k.explicitmime',
      headers: { 'CONTENT-TYPE': 'text/plain' },
    })

    const serialized = await command.serialize(command.input)

    expect(headersOf(serialized)).toEqual({ 'CONTENT-TYPE': 'text/plain' })
    expect(serialized.opMetadata).toBeUndefined()
  })

  it('treats an explicitly empty Content-Type as set', async () => {
    const command = new PutObject({ bucket: 'bucket-1', key: 'k', contentType: '' })

    const serialized = await command.serialize(command.input)
    expect(headersOf(serialized)['Content-Type']).toBe('')
    expect(serialized.opMetadata).toBeUndefined()
  })
})

describe('PutObject deserialize', () => {
  it('lifts the common fields and the four result headers', async () => {
    const command = new PutObject({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(
      output({
        'x-oss-request-id': 'req-1',
        'Content-MD5': 'XUFAKrxLKna5cZ2REBfFkg==',
        ETag: '"5D41402ABC4B2A76B9719D911017C592"',
        'x-oss-hash-crc64ecma': '18446744073709551615',
        'x-oss-version-id': 'v1',
      }),
    )

    expect(result.statusCode).toBe(200)
    expect(result.requestId).toBe('req-1')
    expect(result.contentMd5).toBe('XUFAKrxLKna5cZ2REBfFkg==')
    expect(result.etag).toBe('"5D41402ABC4B2A76B9719D911017C592"')
    expect(result.hashCrc64ecma).toBe('18446744073709551615')
    expect(result.versionId).toBe('v1')
  })

  it('leaves absent headers undefined', async () => {
    const command = new PutObject({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(output({ etag: '"a"' }))
    expect(result.versionId).toBeUndefined()
    expect(result.hashCrc64ecma).toBeUndefined()
  })

  it('drains the response body so the connection can be reused', async () => {
    const body = new SpyBody()
    const command = new PutObject({ bucket: 'bucket-1', key: 'k' })
    await command.deserialize(output({}, body))
    expect(body.reads).toBe(1)
  })

  it('carries a callback reply body as callbackResult', async () => {
    const command = new PutObject({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(output({}, textBody('{"Status":"OK"}')))
    expect(result.callbackResult).toBe('{"Status":"OK"}')
  })

  it('leaves callbackResult undefined for the ordinary empty body', async () => {
    const command = new PutObject({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(output({}, textBody('')))
    expect(result.callbackResult).toBeUndefined()
  })
})

describe('GetObject serialize', () => {
  it('splits modelled fields between headers and query', async () => {
    const command = new GetObject({
      bucket: 'bucket-1',
      key: 'dir/file.txt',
      ifMatch: '"etag"',
      ifNoneMatch: '"other"',
      ifModifiedSince: 'Wed, 28 Dec 2022 10:27:41 GMT',
      ifUnmodifiedSince: 'Thu, 29 Dec 2022 10:27:41 GMT',
      range: 'bytes=0-1023',
      rangeBehavior: 'standard',
      trafficLimit: 8000,
      requestPayer: 'requester',
      versionId: 'v1',
      process: 'image/resize,w_100',
      responseCacheControl: 'no-store',
      responseContentDisposition: 'inline',
      responseContentEncoding: 'identity',
      responseContentLanguage: 'en',
      responseContentType: 'text/plain',
      responseExpires: 'Fri, 30 Dec 2022 10:27:41 GMT',
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('GetObject')
    expect(serialized.method).toBe('GET')
    expect(serialized.opMetadata).toEqual({ 'response-stream': true })
    expect(headersOf(serialized)).toEqual({
      'If-Match': '"etag"',
      'If-None-Match': '"other"',
      'If-Modified-Since': 'Wed, 28 Dec 2022 10:27:41 GMT',
      'If-Unmodified-Since': 'Thu, 29 Dec 2022 10:27:41 GMT',
      Range: 'bytes=0-1023',
      'x-oss-range-behavior': 'standard',
      'x-oss-traffic-limit': '8000',
      'x-oss-request-payer': 'requester',
    })
    expect(serialized.parameters).toEqual({
      versionId: 'v1',
      'x-oss-process': 'image/resize,w_100',
      'response-cache-control': 'no-store',
      'response-content-disposition': 'inline',
      'response-content-encoding': 'identity',
      'response-content-language': 'en',
      'response-content-type': 'text/plain',
      'response-expires': 'Fri, 30 Dec 2022 10:27:41 GMT',
    })
  })

  it('rejects a missing key', () => {
    const command = new GetObject({ bucket: 'bucket-1' })
    expect(() => command.serialize(command.input)).toThrow('missing required field, key')

    const neither = new GetObject({})
    expect(() => neither.serialize(neither.input)).toThrow('missing required field, bucket')
  })

  // Header names are case-insensitive, so the modelled field folds onto the caller's spelling in
  // place; query parameter names are not, so `versionid` and `versionId` are two params, both sent.
  it('folds a hand-set header by case and leaves a hand-set parameter alone', async () => {
    const command = new GetObject({
      bucket: 'bucket-1',
      key: 'k',
      ifMatch: '"etag"',
      range: 'bytes=0-1023',
      versionId: 'v1',
      headers: { 'if-match': '"stale"', RANGE: 'bytes=0-1', 'x-oss-not-modelled': 'kept' },
      parameters: { versionid: 'other' },
    })

    const serialized = await command.serialize(command.input)

    expect(headersOf(serialized)).toEqual({
      'If-Match': '"etag"',
      Range: 'bytes=0-1023',
      'x-oss-not-modelled': 'kept',
    })
    expect(serialized.parameters).toEqual({ versionid: 'other', versionId: 'v1' })
  })
})

describe('GetObject deserialize', () => {
  it('converts every typed header and strips the metadata prefix', async () => {
    const command = new GetObject({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(
      output({
        'x-oss-request-id': 'req-1',
        'Content-Length': '1024',
        'Content-Type': 'text/plain',
        'Content-MD5': 'XUFAKrxLKna5cZ2REBfFkg==',
        ETag: '"abc"',
        'Last-Modified': 'Wed, 28 Dec 2022 10:27:41 GMT',
        Expires: 'not-a-date-but-stored-anyway',
        'x-oss-object-type': 'Normal',
        'x-oss-storage-class': 'Archive',
        'x-oss-hash-crc64ecma': '18446744073709551615',
        'x-oss-tagging-count': '2',
        'x-oss-delete-marker': 'true',
        'x-oss-version-id': 'v1',
        'x-oss-expiration': 'expiry-date="Fri, 30 Dec 2022 00:00:00 GMT", rule-id="r1"',
        'x-oss-restore': 'ongoing-request="true"',
        'x-oss-meta-author': 'alice',
      }),
    )

    expect(result.contentLength).toBe(1024)
    expect(result.contentType).toBe('text/plain')
    expect(result.contentMd5).toBe('XUFAKrxLKna5cZ2REBfFkg==')
    expect(result.etag).toBe('"abc"')
    expect(result.lastModified?.toISOString()).toBe('2022-12-28T10:27:41.000Z')
    expect(result.expires).toBe('not-a-date-but-stored-anyway')
    expect(result.objectType).toBe('Normal')
    expect(result.storageClass).toBe('Archive')
    expect(result.hashCrc64ecma).toBe('18446744073709551615')
    expect(result.taggingCount).toBe(2)
    expect(result.deleteMarker).toBe(true)
    expect(result.versionId).toBe('v1')
    expect(result.restore).toBe('ongoing-request="true"')
    expect(result.metadata).toEqual({ author: 'alice' })
    expect(result.contentRange).toBeUndefined()
  })

  it('hands the body over unread', async () => {
    const body = new SpyBody()
    const command = new GetObject({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(output({}, body))
    expect(result.body).toBe(body)
    expect(body.reads).toBe(0)
  })

  it('reports Content-Range on a partial response', async () => {
    const command = new GetObject({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(
      output({ 'Content-Range': 'bytes 0-1023/4096', 'Content-Length': '1024' }, textBody('x'), 206),
    )
    expect(result.statusCode).toBe(206)
    expect(result.contentRange).toBe('bytes 0-1023/4096')
  })
})

describe('HeadObject serialize', () => {
  it('splits modelled fields between headers and query', async () => {
    const command = new HeadObject({
      bucket: 'bucket-1',
      key: 'dir/file.txt',
      ifMatch: '"etag"',
      ifNoneMatch: '"other"',
      ifModifiedSince: 'Wed, 28 Dec 2022 10:27:41 GMT',
      ifUnmodifiedSince: 'Thu, 29 Dec 2022 10:27:41 GMT',
      requestPayer: 'requester',
      versionId: 'v1',
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('HeadObject')
    expect(serialized.method).toBe('HEAD')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.key).toBe('dir/file.txt')
    expect(headersOf(serialized)).toEqual({
      'If-Match': '"etag"',
      'If-None-Match': '"other"',
      'If-Modified-Since': 'Wed, 28 Dec 2022 10:27:41 GMT',
      'If-Unmodified-Since': 'Thu, 29 Dec 2022 10:27:41 GMT',
      'x-oss-request-payer': 'requester',
    })
    expect(serialized.parameters).toEqual({ versionId: 'v1' })
  })

  it('lets a modelled field win over the same header set by hand, whatever its case', async () => {
    const command = new HeadObject({
      bucket: 'bucket-1',
      key: 'k',
      ifMatch: '"etag"',
      headers: { 'IF-MATCH': 'stale', 'x-oss-not-modelled': 'kept' },
    })

    const serialized = await command.serialize(command.input)

    expect(headersOf(serialized)).toEqual({ 'If-Match': '"etag"', 'x-oss-not-modelled': 'kept' })
  })

  // `serialize` is not `async`, so `requireField` throws synchronously and `rejects.toThrow` could not see it.
  it('rejects a missing bucket', () => {
    const command = new HeadObject({ key: 'k' })
    expect(() => command.serialize(command.input)).toThrow(ParamRequiredError)
    expect(() => command.serialize(command.input)).toThrow('missing required field, bucket')

    const neither = new HeadObject({})
    expect(() => neither.serialize(neither.input)).toThrow('missing required field, bucket')
  })
})

describe('HeadObject deserialize', () => {
  it('produces the metadata GetObject would', async () => {
    const command = new HeadObject({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(
      output({
        'x-oss-request-id': 'req-1',
        'Content-Length': '1024',
        'Content-Type': 'text/plain',
        ETag: '"abc"',
        'Last-Modified': 'Wed, 28 Dec 2022 10:27:41 GMT',
        'x-oss-storage-class': 'Archive',
        'x-oss-meta-author': 'alice',
      }),
    )

    expect(result.requestId).toBe('req-1')
    expect(result.contentLength).toBe(1024)
    expect(result.contentType).toBe('text/plain')
    expect(result.etag).toBe('"abc"')
    expect(result.lastModified?.toISOString()).toBe('2022-12-28T10:27:41.000Z')
    expect(result.storageClass).toBe('Archive')
    expect(result.metadata).toEqual({ author: 'alice' })
    expect('body' in result).toBe(false)
  })

  it('drains the response body so the connection can be reused', async () => {
    const body = new SpyBody()
    const command = new HeadObject({ bucket: 'bucket-1', key: 'k' })
    await command.deserialize(output({}, body))
    expect(body.reads).toBe(1)
  })
})

describe('DeleteObject serialize', () => {
  it('sends the version as a query parameter and the payer as a header', async () => {
    const command = new DeleteObject({
      bucket: 'bucket-1',
      key: 'dir/file.txt',
      versionId: 'v1',
      requestPayer: 'requester',
      // The same case-collision guard as the HeadObject test; this is the only header this API
      // has, so folding it in here is cheaper than a second test.
      headers: { 'X-OSS-REQUEST-PAYER': 'stale' },
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('DeleteObject')
    expect(serialized.method).toBe('DELETE')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.key).toBe('dir/file.txt')
    expect(headersOf(serialized)).toEqual({
      'x-oss-request-payer': 'requester',
      // The md5 of no bytes, this operation having no body to hash.
      'Content-MD5': '1B2M2Y8AsgTpgAmY7PhCfg==',
    })
    expect(serialized.parameters).toEqual({ versionId: 'v1' })
  })

  it('rejects a missing key', () => {
    const command = new DeleteObject({ bucket: 'bucket-1' })
    expect(() => command.serialize(command.input)).toThrow(ParamRequiredError)
    expect(() => command.serialize(command.input)).toThrow('missing required field, key')

    const neither = new DeleteObject({})
    expect(() => neither.serialize(neither.input)).toThrow('missing required field, bucket')
  })

  // A caller who sent a Content-MD5 by hand keeps it, under their own spelling: overwriting it was a
  // shipped bug in the v1-generation `ali-oss` (CHANGELOG #1100), and there is no reading of a
  // by-hand value that the SDK is better placed to correct than the caller.
  it('leaves a Content-MD5 the caller set by hand alone, whatever its case', async () => {
    const command = new DeleteObject({
      bucket: 'bucket-1',
      key: 'k',
      headers: { 'content-md5': 'XUFAKrxLKna5cZ2REBfFkg==' },
    })

    const serialized = await command.serialize(command.input)

    expect(headersOf(serialized)).toEqual({ 'content-md5': 'XUFAKrxLKna5cZ2REBfFkg==' })
  })
})

describe('DeleteObject deserialize', () => {
  it('lifts the version id and the delete marker', async () => {
    const command = new DeleteObject({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(
      output({ 'x-oss-request-id': 'req-1', 'x-oss-version-id': 'v1', 'x-oss-delete-marker': 'true' }, undefined, 204),
    )

    expect(result.statusCode).toBe(204)
    expect(result.requestId).toBe('req-1')
    expect(result.versionId).toBe('v1')
    expect(result.deleteMarker).toBe(true)
  })

  it('leaves both fields undefined for an unversioned bucket', async () => {
    const command = new DeleteObject({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(output({}, undefined, 204))
    expect(result.versionId).toBeUndefined()
    expect(result.deleteMarker).toBeUndefined()
  })

  // A 204 should carry no body at all, which is exactly the case the drain guards: a platform
  // transport may still hand over an empty body object, and leaving it unread strands the
  // connection.
  it('drains the response body so the connection can be reused', async () => {
    const body = new SpyBody()
    const command = new DeleteObject({ bucket: 'bucket-1', key: 'k' })
    await command.deserialize(output({}, body, 204))
    expect(body.reads).toBe(1)
  })
})

describe('CopyObject serialize', () => {
  it('maps every modelled field to its wire name and builds the copy-source header', async () => {
    const command = new CopyObject({
      bucket: 'dst-bucket',
      key: 'dst/file.txt',
      sourceBucket: 'src-bucket',
      sourceKey: 'src/dir/file.txt',
      sourceVersionId: 'sv1',
      forbidOverwrite: true,
      copySourceIfMatch: '"etag"',
      copySourceIfNoneMatch: '"other"',
      copySourceIfModifiedSince: 'Wed, 28 Dec 2022 10:27:41 GMT',
      copySourceIfUnmodifiedSince: 'Thu, 29 Dec 2022 10:27:41 GMT',
      metadataDirective: 'REPLACE',
      serverSideEncryption: 'KMS',
      serverSideDataEncryption: 'SM4',
      serverSideEncryptionKeyId: 'key-1',
      acl: 'private',
      storageClass: 'IA',
      tagging: 'k=v',
      taggingDirective: 'Replace',
      metadata: { author: 'alice' },
      requestPayer: 'requester',
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('CopyObject')
    expect(serialized.method).toBe('PUT')
    expect(serialized.bucket).toBe('dst-bucket')
    expect(serialized.key).toBe('dst/file.txt')
    expect(headersOf(serialized)).toEqual({
      // The source key's slashes are percent-encoded, so it arrives as one opaque segment.
      'x-oss-copy-source': '/src-bucket/src%2Fdir%2Ffile.txt?versionId=sv1',
      'x-oss-forbid-overwrite': 'true',
      'x-oss-copy-source-if-match': '"etag"',
      'x-oss-copy-source-if-none-match': '"other"',
      'x-oss-copy-source-if-modified-since': 'Wed, 28 Dec 2022 10:27:41 GMT',
      'x-oss-copy-source-if-unmodified-since': 'Thu, 29 Dec 2022 10:27:41 GMT',
      'x-oss-metadata-directive': 'REPLACE',
      'x-oss-server-side-encryption': 'KMS',
      'x-oss-server-side-data-encryption': 'SM4',
      'x-oss-server-side-encryption-key-id': 'key-1',
      'x-oss-object-acl': 'private',
      'x-oss-storage-class': 'IA',
      'x-oss-tagging': 'k=v',
      'x-oss-tagging-directive': 'Replace',
      'x-oss-request-payer': 'requester',
      'x-oss-meta-author': 'alice',
      'Content-MD5': '1B2M2Y8AsgTpgAmY7PhCfg==',
    })
  })

  it('defaults the source bucket to the destination bucket and omits the version', async () => {
    const command = new CopyObject({ bucket: 'bucket-1', key: 'dst', sourceKey: 'src' })
    const serialized = await command.serialize(command.input)
    expect(headersOf(serialized)['x-oss-copy-source']).toBe('/bucket-1/src')
  })

  it('rejects a missing bucket, key or source key by name', () => {
    const noSource = new CopyObject({ bucket: 'bucket-1', key: 'dst' })
    expect(() => noSource.serialize(noSource.input)).toThrow(ParamRequiredError)
    expect(() => noSource.serialize(noSource.input)).toThrow('missing required field, sourceKey')

    const noKey = new CopyObject({ bucket: 'bucket-1', sourceKey: 'src' })
    expect(() => noKey.serialize(noKey.input)).toThrow('missing required field, key')
  })
})

describe('CopyObject deserialize', () => {
  it('reads LastModified and ETag from the body and the version ids from the headers', async () => {
    const command = new CopyObject({ bucket: 'bucket-1', key: 'dst', sourceKey: 'src' })
    const result = await command.deserialize(
      output(
        { 'x-oss-copy-source-version-id': 'sv1', 'x-oss-version-id': 'dv1' },
        textBody(
          '<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult>' +
            '<LastModified>2022-12-28T10:27:41.000Z</LastModified><ETag>"abc"</ETag></CopyObjectResult>',
        ),
      ),
    )

    expect(result.lastModified?.toISOString()).toBe('2022-12-28T10:27:41.000Z')
    expect(result.etag).toBe('"abc"')
    expect(result.copySourceVersionId).toBe('sv1')
    expect(result.versionId).toBe('dv1')
  })

  // A 200 with an empty body is the copy having failed mid-stream; nothing to parse, so the version
  // headers are all the result carries.
  it('tolerates an empty body', async () => {
    const command = new CopyObject({ bucket: 'bucket-1', key: 'dst', sourceKey: 'src' })
    const result = await command.deserialize(output({ 'x-oss-version-id': 'dv1' }))
    expect(result.lastModified).toBeUndefined()
    expect(result.etag).toBeUndefined()
    expect(result.versionId).toBe('dv1')
  })

  it('rejects a foreign root element by name', async () => {
    const command = new CopyObject({ bucket: 'bucket-1', key: 'dst', sourceKey: 'src' })
    await expect(command.deserialize(output({}, textBody('<Nope/>')))).rejects.toThrow(
      'expected element type <CopyObjectResult> but have <Nope>',
    )
  })
})

describe('AppendObject serialize', () => {
  it('sends the position as a query parameter and the body verbatim', async () => {
    const command = new AppendObject({
      bucket: 'bucket-1',
      key: 'log.txt',
      body: 'more',
      position: 1024,
      contentType: 'text/plain',
      cacheControl: 'no-cache',
      contentDisposition: 'attachment',
      contentEncoding: 'gzip',
      contentMd5: 'XUFAKrxLKna5cZ2REBfFkg==',
      expires: 'Wed, 28 Dec 2022 10:27:41 GMT',
      acl: 'private',
      serverSideEncryption: 'AES256',
      storageClass: 'IA',
      metadata: { author: 'alice' },
      requestPayer: 'requester',
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('AppendObject')
    expect(serialized.method).toBe('POST')
    expect(serialized.body).toBe('more')
    expect(serialized.parameters).toEqual({ append: '', position: '1024' })
    expect(headersOf(serialized)).toEqual({
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache',
      'Content-Disposition': 'attachment',
      'Content-Encoding': 'gzip',
      'Content-MD5': 'XUFAKrxLKna5cZ2REBfFkg==',
      Expires: 'Wed, 28 Dec 2022 10:27:41 GMT',
      'x-oss-object-acl': 'private',
      'x-oss-server-side-encryption': 'AES256',
      'x-oss-storage-class': 'IA',
      'x-oss-request-payer': 'requester',
      'x-oss-meta-author': 'alice',
    })
  })

  // The first append is position 0, and 0 is not undefined, so it must be sent rather than dropped.
  it('sends a zero position and marks a missing Content-Type for deferred detection', async () => {
    const command = new AppendObject({ bucket: 'bucket-1', key: 'events.json', position: 0 })
    const serialized = await command.serialize(command.input)
    expect(serialized.parameters).toEqual({ append: '', position: '0' })
    expect(headersOf(serialized)['Content-Type']).toBeUndefined()
    expect(serialized.opMetadata).toEqual({ detect_content_type: true })
  })

  it('rejects a missing bucket or key by name', () => {
    const command = new AppendObject({ key: 'k', position: 0 })
    expect(() => command.serialize(command.input)).toThrow('missing required field, bucket')
  })
})

describe('AppendObject deserialize', () => {
  it('lifts the next append position, crc and version', async () => {
    const command = new AppendObject({ bucket: 'bucket-1', key: 'k', position: 0 })
    const result = await command.deserialize(
      output({
        'x-oss-next-append-position': '2048',
        'x-oss-hash-crc64ecma': '18446744073709551615',
        'x-oss-version-id': 'v1',
      }),
    )

    expect(result.nextAppendPosition).toBe(2048)
    expect(result.hashCrc64ecma).toBe('18446744073709551615')
    expect(result.versionId).toBe('v1')
  })

  it('drains the response body so the connection can be reused', async () => {
    const body = new SpyBody()
    const command = new AppendObject({ bucket: 'bucket-1', key: 'k', position: 0 })
    await command.deserialize(output({}, body))
    expect(body.reads).toBe(1)
  })
})

describe('DeleteMultipleObjects serialize', () => {
  it('builds the Delete body, its computed Content-MD5 and the encoding-type parameter', async () => {
    const command = new DeleteMultipleObjects({
      bucket: 'bucket-1',
      objects: [{ key: 'a.txt' }, { key: 'dir/b.txt', versionId: 'v2' }],
      quiet: true,
      requestPayer: 'requester',
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('DeleteMultipleObjects')
    expect(serialized.method).toBe('POST')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Delete><Quiet>true</Quiet>' +
        '<Object><Key>a.txt</Key></Object>' +
        '<Object><Key>dir/b.txt</Key><VersionId>v2</VersionId></Object></Delete>',
    )
    expect(headersOf(serialized)).toEqual({
      'Content-Type': 'application/xml',
      'Content-MD5': 'xnJAt2EXBwTuZ9VPzRawWQ==',
      'x-oss-request-payer': 'requester',
    })
    expect(serialized.parameters).toEqual({ delete: '', 'encoding-type': 'url' })
  })

  it('escapes a key carrying XML metacharacters and a control character', async () => {
    const command = new DeleteMultipleObjects({ bucket: 'bucket-1', objects: [{ key: 'a&b<c>\x01.txt' }] })

    const serialized = await command.serialize(command.input)

    expect(serialized.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Delete>' +
        '<Object><Key>a&amp;b&lt;c&gt;&#x01;.txt</Key></Object></Delete>',
    )
  })

  it('rejects a missing bucket or objects by name', () => {
    const noObjects = new DeleteMultipleObjects({ bucket: 'bucket-1' })
    expect(() => noObjects.serialize(noObjects.input)).toThrow('missing required field, objects')

    const noBucket = new DeleteMultipleObjects({ objects: [{ key: 'a' }] })
    expect(() => noBucket.serialize(noBucket.input)).toThrow('missing required field, bucket')
  })
})

describe('DeleteMultipleObjects deserialize', () => {
  it('url-decodes the keys when the encoding type says to', async () => {
    const command = new DeleteMultipleObjects({ bucket: 'bucket-1', objects: [{ key: 'a' }] })
    const result = await command.deserialize(
      output(
        {},
        textBody(
          '<?xml version="1.0" encoding="UTF-8"?><DeleteResult><EncodingType>url</EncodingType>' +
            '<Deleted><Key>dir%2Fa.txt</Key><VersionId>v1</VersionId><DeleteMarker>true</DeleteMarker>' +
            '<DeleteMarkerVersionId>dm1</DeleteMarkerVersionId></Deleted>' +
            '<Deleted><Key>b%20c.txt</Key></Deleted></DeleteResult>',
        ),
      ),
    )

    expect(result.encodingType).toBe('url')
    expect(result.deleted).toEqual([
      { key: 'dir/a.txt', versionId: 'v1', deleteMarker: true, deleteMarkerVersionId: 'dm1' },
      { key: 'b c.txt', versionId: undefined, deleteMarker: undefined, deleteMarkerVersionId: undefined },
    ])
  })

  it('leaves the keys as they are when no encoding type is present', async () => {
    const command = new DeleteMultipleObjects({ bucket: 'bucket-1', objects: [{ key: 'a' }] })
    const result = await command.deserialize(
      output(
        {},
        textBody('<?xml version="1.0" encoding="UTF-8"?><DeleteResult><Deleted><Key>dir%2Fa.txt</Key></Deleted></DeleteResult>'),
      ),
    )
    expect(result.encodingType).toBeUndefined()
    expect(result.deleted?.[0]?.key).toBe('dir%2Fa.txt')
  })

  it('reads the encoding type case-insensitively, like the other list operations', async () => {
    const command = new DeleteMultipleObjects({ bucket: 'bucket-1', objects: [{ key: 'a' }] })
    const result = await command.deserialize(
      output(
        {},
        textBody(
          '<?xml version="1.0" encoding="UTF-8"?><DeleteResult><EncodingType>URL</EncodingType>' +
            '<Deleted><Key>dir%2Fa.txt</Key></Deleted></DeleteResult>',
        ),
      ),
    )
    expect(result.deleted?.[0]?.key).toBe('dir/a.txt')
  })

  // Quiet mode omits the successfully deleted objects, so an empty result is the ordinary case rather
  // than an error: `deleted` collapses to undefined rather than an empty array.
  it('reports no deleted objects as undefined', async () => {
    const command = new DeleteMultipleObjects({ bucket: 'bucket-1', objects: [{ key: 'a' }], quiet: true })
    const result = await command.deserialize(
      output({}, textBody('<?xml version="1.0" encoding="UTF-8"?><DeleteResult></DeleteResult>')),
    )
    expect(result.deleted).toBeUndefined()
  })

  it('rejects a foreign root element by name', async () => {
    const command = new DeleteMultipleObjects({ bucket: 'bucket-1', objects: [{ key: 'a' }] })
    await expect(command.deserialize(output({}, textBody('<Nope/>')))).rejects.toThrow(DeserializationError)
  })
})

describe('GetObjectMeta serialize', () => {
  it('sends objectMeta and the version as query parameters', async () => {
    const command = new GetObjectMeta({
      bucket: 'bucket-1',
      key: 'dir/file.txt',
      versionId: 'v1',
      requestPayer: 'requester',
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('GetObjectMeta')
    expect(serialized.method).toBe('HEAD')
    expect(serialized.parameters).toEqual({ objectMeta: '', versionId: 'v1' })
    expect(headersOf(serialized)).toEqual({
      'x-oss-request-payer': 'requester',
      'Content-MD5': '1B2M2Y8AsgTpgAmY7PhCfg==',
    })
  })

  it('rejects a missing key', () => {
    const command = new GetObjectMeta({ bucket: 'bucket-1' })
    expect(() => command.serialize(command.input)).toThrow('missing required field, key')
  })
})

describe('GetObjectMeta deserialize', () => {
  it('lifts the small fixed set of fields from the headers', async () => {
    const command = new GetObjectMeta({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(
      output({
        'Content-Length': '1024',
        ETag: '"abc"',
        'Last-Modified': 'Wed, 28 Dec 2022 10:27:41 GMT',
        'x-oss-last-access-time': 'Thu, 29 Dec 2022 10:27:41 GMT',
        'x-oss-transition-time': 'Fri, 30 Dec 2022 10:27:41 GMT',
        'x-oss-version-id': 'v1',
      }),
    )

    expect(result.contentLength).toBe(1024)
    expect(result.etag).toBe('"abc"')
    expect(result.lastModified?.toISOString()).toBe('2022-12-28T10:27:41.000Z')
    expect(result.lastAccessTime).toBe('Thu, 29 Dec 2022 10:27:41 GMT')
    expect(result.transitionTime).toBe('Fri, 30 Dec 2022 10:27:41 GMT')
    expect(result.versionId).toBe('v1')
  })

  it('drains the response body so the connection can be reused', async () => {
    const body = new SpyBody()
    const command = new GetObjectMeta({ bucket: 'bucket-1', key: 'k' })
    await command.deserialize(output({}, body))
    expect(body.reads).toBe(1)
  })
})

describe('RestoreObject serialize', () => {
  it('builds the RestoreRequest body and its computed Content-MD5', async () => {
    const command = new RestoreObject({
      bucket: 'bucket-1',
      key: 'cold.dat',
      versionId: 'v1',
      restoreRequest: { days: 2, jobParameters: { tier: 'Expedited' } },
      requestPayer: 'requester',
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('RestoreObject')
    expect(serialized.method).toBe('POST')
    expect(serialized.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><RestoreRequest><Days>2</Days>' +
        '<JobParameters><Tier>Expedited</Tier></JobParameters></RestoreRequest>',
    )
    expect(headersOf(serialized)).toEqual({
      'Content-Type': 'application/xml',
      'Content-MD5': 'kSqM93V+Th7IthfoNOIZFw==',
      'x-oss-request-payer': 'requester',
    })
    expect(serialized.parameters).toEqual({ restore: '', versionId: 'v1' })
  })

  // Restoring an Archive object with the defaults sends no body, so the Content-MD5 falls back to the
  // md5 of no bytes.
  it('sends no body and the empty-body Content-MD5 when no parameters are given', async () => {
    const command = new RestoreObject({ bucket: 'bucket-1', key: 'k' })
    const serialized = await command.serialize(command.input)
    expect(serialized.body).toBeUndefined()
    expect(headersOf(serialized)['Content-MD5']).toBe('1B2M2Y8AsgTpgAmY7PhCfg==')
  })

  it('rejects a missing key', () => {
    const command = new RestoreObject({ bucket: 'bucket-1' })
    expect(() => command.serialize(command.input)).toThrow('missing required field, key')
  })
})

describe('RestoreObject deserialize', () => {
  it('lifts the restore priority and the version', async () => {
    const command = new RestoreObject({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(
      output({ 'x-oss-object-restore-priority': 'Standard', 'x-oss-version-id': 'v1' }, undefined, 202),
    )

    expect(result.statusCode).toBe(202)
    expect(result.objectRestorePriority).toBe('Standard')
    expect(result.versionId).toBe('v1')
  })
})

describe('CleanRestoredObject serialize', () => {
  it('sends the cleanRestoredObject parameter and the empty-body headers', async () => {
    const command = new CleanRestoredObject({ bucket: 'bucket-1', key: 'k', requestPayer: 'requester' })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('CleanRestoredObject')
    expect(serialized.method).toBe('POST')
    expect(serialized.parameters).toEqual({ cleanRestoredObject: '' })
    expect(headersOf(serialized)).toEqual({
      'Content-Type': 'application/xml',
      'Content-MD5': '1B2M2Y8AsgTpgAmY7PhCfg==',
      'x-oss-request-payer': 'requester',
    })
  })

  it('rejects a missing key', () => {
    const command = new CleanRestoredObject({ bucket: 'bucket-1' })
    expect(() => command.serialize(command.input)).toThrow('missing required field, key')
  })
})

describe('CleanRestoredObject deserialize', () => {
  it('drains the response body so the connection can be reused', async () => {
    const body = new SpyBody()
    const command = new CleanRestoredObject({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(output({ 'x-oss-request-id': 'req-1' }, body))
    expect(result.requestId).toBe('req-1')
    expect(body.reads).toBe(1)
  })
})

describe('serializePresign', () => {
  // The one difference from `serialize`: it writes neither a default `Content-Type` nor the marker
  // that creates one. Sending either would bind whoever uploads through the URL to a header they never chose.
  it('leaves PutObject without the default Content-Type marker', async () => {
    const command = new PutObject({ bucket: 'bucket-1', key: 'k' })
    const serialized = await command.serializePresign(command.input)
    expect(headersOf(serialized)).toEqual({})
    expect(serialized.opMetadata).toBeUndefined()
  })

  it('keeps a Content-Type the caller asked for', async () => {
    const command = new PutObject({ bucket: 'bucket-1', key: 'k', contentType: 'text/plain' })
    expect(headersOf(await command.serializePresign(command.input))).toEqual({ 'Content-Type': 'text/plain' })
  })

  it('rejects a missing field by name, as serialize does', () => {
    const command = new PutObject({ key: 'k' })
    expect(() => command.serializePresign(command.input)).toThrow('missing required field, bucket')
  })

  // The SDK adds nothing of its own to a download or a head, so these two envelopes are the same one.
  it('builds the same envelope as serialize for GetObject', async () => {
    const command = new GetObject({ bucket: 'bucket-1', key: 'k', versionId: 'v1', range: 'bytes=0-1' })
    expect(await command.serializePresign(command.input)).toEqual(await command.serialize(command.input))
  })

  it('builds the same envelope as serialize for HeadObject', async () => {
    const command = new HeadObject({ bucket: 'bucket-1', key: 'k', versionId: 'v1' })
    expect(await command.serializePresign(command.input)).toEqual(await command.serialize(command.input))
  })
})

// Every operation states its name twice: on the class, where `Client` reads it to report a serializer
// that threw, and in the envelope, which is the only name the raw `Client.invokeOperation` path has.
// The tests above pin each envelope to a literal, so pinning the class to the envelope closes the pair.
describe('opName', () => {
  it('names the same operation on the class as in the envelope', async () => {
    const put = new PutObject({ bucket: 'bucket-1', key: 'k' })
    const get = new GetObject({ bucket: 'bucket-1', key: 'k' })
    const head = new HeadObject({ bucket: 'bucket-1', key: 'k' })
    const remove = new DeleteObject({ bucket: 'bucket-1', key: 'k' })

    expect((await put.serialize(put.input)).opName).toBe(put.opName)
    expect((await get.serialize(get.input)).opName).toBe(get.opName)
    expect((await head.serialize(head.input)).opName).toBe(head.opName)
    expect((await remove.serialize(remove.input)).opName).toBe(remove.opName)
    expect((await put.serializePresign(put.input)).opName).toBe(put.opName)
  })
})
