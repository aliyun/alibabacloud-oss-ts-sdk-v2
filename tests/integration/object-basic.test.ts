import { beforeAll, describe, expect, it } from 'vitest'
import {
  AppendObject,
  CopyObject,
  DeleteMultipleObjects,
  DeleteObject,
  GetObject,
  GetObjectMeta,
  HeadObject,
  ListObjectsV2,
  PutObject,
  ServiceError,
  TransportCapabilityType,
} from '../../src/index.js'
import { createNodeTransport } from '../../src/runtime/node/index.js'
import { toBase64 } from '../../src/utils/base64.js'
import { toHex } from '../../src/utils/hex.js'
import { md5 } from '../../src/utils/md5.js'
import { failure, live, liveBucket, liveClient, uniqueKey } from './fixtures/live.js'

const bucket = liveBucket()

const STORAGE_CLASSES = /^(Standard|IA|Archive|ColdArchive|DeepColdArchive)$/

describe.skipIf(!live)('object basics against the live service', () => {
  const client = liveClient()
  const prefix = uniqueKey('happy')
  const key = prefix + '/hello.txt'

  // CJK on purpose: `contentLength` counts bytes, `String.length` counts UTF-16 code units.
  const content = 'hello from the typescript sdk 世界'
  const size = new TextEncoder().encode(content).byteLength

  const digest = md5(new TextEncoder().encode(content))
  const expectedEtag = '"' + toHex(digest).toUpperCase() + '"'
  const expectedContentMd5 = toBase64(digest)

  // Not derivable locally (v0.1 has no CRC64): measured against the live service on 2026-08-23.
  // Changing `content` means re-measuring this.
  const expectedHashCrc64 = '2861621986004973752'

  it('PutObject stores the object and returns checksums of the bytes we sent', async () => {
    const result = await client.send(
      new PutObject({ bucket, key, body: content, contentType: 'text/plain', metadata: { author: 'itest' } }),
    )

    expect(result.statusCode).toBe(200)
    expect(result.requestId.length).toBeGreaterThan(0)
    expect(result.etag).toBe(expectedEtag)
    expect(result.contentMd5).toBe(expectedContentMd5)
    expect(result.hashCrc64ecma).toBe(expectedHashCrc64)
  })

  // This and the three tests after it read what the PutObject above created, so the suite relies on
  // vitest's in-file order.
  it('GetObject returns the exact bytes and the metadata that was set', async () => {
    const result = await client.send(new GetObject({ bucket, key }))

    expect(result.statusCode).toBe(200)
    expect(await result.body?.text()).toBe(content)
    expect(result.contentType).toBe('text/plain')
    expect(result.contentLength).toBe(size)
    expect(result.metadata).toEqual({ author: 'itest' })
    expect(result.hashCrc64ecma).toBe(expectedHashCrc64)
    expect(result.lastModified).toBeInstanceOf(Date)
  })

  it('GetObject with a Range returns 206 and the requested slice', async () => {
    const result = await client.send(new GetObject({ bucket, key, range: 'bytes=0-4' }))

    expect(result.statusCode).toBe(206)
    expect(await result.body?.text()).toBe('hello')
    expect(result.contentRange).toBe('bytes 0-4/' + String(size))
    expect(result.contentLength).toBe(5)
    // A 206 reports the CRC64 of the whole object, not of the five bytes returned.
    expect(result.hashCrc64ecma).toBe(expectedHashCrc64)
  })

  it('HeadObject reports the size, type and metadata from headers alone', async () => {
    const result = await client.send(new HeadObject({ bucket, key }))

    expect(result.statusCode).toBe(200)
    expect(result.contentLength).toBe(size)
    expect(result.contentType).toBe('text/plain')
    // Not redundant with PutObject: those headers are read inline there, through `copyMeta` here, and
    // a write can be acknowledged then stored wrong -- this asks what the service says it holds now.
    expect(result.etag).toBe(expectedEtag)
    expect(result.contentMd5).toBe(expectedContentMd5)
    expect(result.hashCrc64ecma).toBe(expectedHashCrc64)
    expect(result.metadata).toEqual({ author: 'itest' })
  })

  it('ListObjectsV2 finds the object under its prefix', async () => {
    const result = await client.send(new ListObjectsV2({ bucket, prefix, maxKeys: 10 }))

    expect(result.statusCode).toBe(200)
    expect(result.name).toBe(bucket)
    // `prefix` contains `/`, returned percent-encoded, so this asserts the deserializer's url-decoding.
    expect(result.prefix).toBe(prefix)
    expect(result.contents).toBeDefined()
    expect(result.contents?.map((entry) => entry.key)).toContain(key)
    const entry = result.contents?.find((candidate) => candidate.key === key)
    expect(entry?.size).toBe(size)
    expect(entry?.storageClass).toMatch(STORAGE_CLASSES)
  })

  it('ListObjectsV2 with a delimiter reports the common prefix instead of the keys', async () => {
    const result = await client.send(new ListObjectsV2({ bucket, prefix, delimiter: '/' }))

    expect(result.statusCode).toBe(200)
    expect(result.delimiter).toBe('/')
    expect(result.commonPrefixes).toBeDefined()
    expect(result.commonPrefixes?.map((each) => each.prefix)).toContain(prefix + '/')
    // Absent, not `[]`: `deserializeListObjectsV2` maps an empty listing to `undefined`.
    expect(result.contents).toBeUndefined()
    expect(result.isTruncated).toBe(false)
    expect(result.keyCount).toBeGreaterThan(0)
  })

  it('PutObject accepts a Uint8Array body as well as a string', async () => {
    const binaryKey = prefix + '/bytes.bin'
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255])
    await client.send(new PutObject({ bucket, key: binaryKey, body: bytes }))

    const result = await client.send(new GetObject({ bucket, key: binaryKey }))
    expect(await result.body?.bytes()).toEqual(bytes)
  })

  it('DeleteObject removes the object and a following GetObject fails', async () => {
    const doomedKey = prefix + '/doomed.txt'
    await client.send(new PutObject({ bucket, key: doomedKey, body: 'x' }))

    const deleted = await client.send(new DeleteObject({ bucket, key: doomedKey }))
    expect(deleted.statusCode).toBe(204)

    const error = await failure(client.send(new GetObject({ bucket, key: doomedKey })), ServiceError)
    expect(error.code).toBe('NoSuchKey')
    expect(error.statusCode).toBe(404)
    expect(error.requestId.length).toBeGreaterThan(0)
    expect(error.ec).toBe('0026-00000001')
  })

  it('GetObjectMeta reports the size and etag without the user metadata', async () => {
    const result = await client.send(new GetObjectMeta({ bucket, key }))

    expect(result.statusCode).toBe(200)
    expect(result.contentLength).toBe(size)
    expect(result.etag).toBe(expectedEtag)
    expect(result.lastModified).toBeInstanceOf(Date)
    // GetObjectMeta carries no stored user metadata, unlike HeadObject.
    expect('metadata' in result).toBe(false)
  })

  it('CopyObject duplicates the object to a new key', async () => {
    const copyKey = prefix + '/hello-copy.txt'
    const copied = await client.send(new CopyObject({ bucket, key: copyKey, sourceKey: key }))

    expect(copied.statusCode).toBe(200)
    expect(copied.etag).toBe(expectedEtag)
    expect(copied.lastModified).toBeInstanceOf(Date)

    const read = await client.send(new GetObject({ bucket, key: copyKey }))
    expect(await read.body?.text()).toBe(content)
    // No content type was sent with the copy, so the destination keeps the source's own.
    expect(read.contentType).toBe('text/plain')
  })

  it('AppendObject grows an appendable object across two calls', async () => {
    const appendKey = prefix + '/appendable.txt'

    const first = await client.send(new AppendObject({ bucket, key: appendKey, position: 0, body: 'hello ' }))
    expect(first.statusCode).toBe(200)
    expect(first.nextAppendPosition).toBe(6)

    const second = await client.send(
      new AppendObject({ bucket, key: appendKey, position: first.nextAppendPosition, body: 'world' }),
    )
    expect(second.nextAppendPosition).toBe(11)

    const read = await client.send(new GetObject({ bucket, key: appendKey }))
    expect(await read.body?.text()).toBe('hello world')
    expect(read.objectType).toBe('Appendable')
  })

  it('DeleteMultipleObjects removes several keys in one request', async () => {
    const keys = [prefix + '/multi-1.txt', prefix + '/multi-2.txt']
    for (const each of keys) await client.send(new PutObject({ bucket, key: each, body: 'x' }))

    const result = await client.send(
      new DeleteMultipleObjects({ bucket, objects: keys.map((each) => ({ key: each })) }),
    )

    expect(result.statusCode).toBe(200)
    expect(result.deleted?.map((each) => each.key).sort()).toEqual([...keys].sort())

    const error = await failure(client.send(new GetObject({ bucket, key: keys[0] })), ServiceError)
    expect(error.code).toBe('NoSuchKey')
  })
})

// The letters match the measured matrix: under COPY the service ignores the request's content type, only
// REPLACE lets it decide the destination, and an empty value counts as none there. A type a transport adds
// after signing is in neither the signature nor the caller's intent, so the client has to settle it first.
describe.skipIf(!live)('the content type CopyObject stores against the live service', () => {
  const client = liveClient()
  const source = uniqueKey('copy-content-type-src')

  beforeAll(async () => {
    await client.send(new PutObject({ bucket, key: source, body: 'copy source', contentType: 'image/png' }))
  })

  const cases: [string, string, Record<string, string> | undefined, string | undefined, string][] = [
    ['A', 'unset', undefined, undefined, 'image/png'],
    ['B', 'empty', { 'Content-Type': '' }, undefined, 'image/png'],
    ['D', 'application/xml', { 'Content-Type': 'application/xml' }, undefined, 'image/png'],
    ['E', 'unset', undefined, 'REPLACE', 'image/png'],
    ['F', 'empty', { 'Content-Type': '' }, 'REPLACE', 'image/png'],
    ['G', 'application/xml', { 'Content-Type': 'application/xml' }, 'REPLACE', 'application/xml'],
  ]

  for (const [letter, given, headers, directive, expected] of cases) {
    it(`${letter}: ${given} with ${directive ?? 'COPY'} stores ${expected}`, async () => {
      const dest = uniqueKey('copy-content-type-dst')
      const copied = await client.send(new CopyObject({ bucket, key: dest, sourceKey: source, headers, metadataDirective: directive }))

      expect(copied.statusCode).toBe(200)
      const read = await client.send(new GetObject({ bucket, key: dest }))
      expect(read.contentType).toBe(expected)
      expect(await read.body?.text()).toBe('copy source')
    })
  }
})

// A url is served to whoever holds it, with whatever headers that party sends, so the signing rules here
// were measured against the live service on 2026-11-25 rather than read off the client.
describe.skipIf(!live)('a presigned url against the live service', () => {
  const client = liveClient()
  const key = uniqueKey('presign-src')
  const content = 'presigned content'

  // The node transport reporting the content-type capability of a filling platform, on the same live setup.
  const filling = liveClient({
    transport: Object.assign(createNodeTransport(), { capabilities: [TransportCapabilityType.FILLS_CONTENT_TYPE] }),
  })

  beforeAll(async () => {
    await client.send(new PutObject({ bucket, key, body: content, contentType: 'text/plain' }))
  })

  it('serves a GetObject url to a caller that sends no content type', async () => {
    const presigned = await client.presign(new GetObject({ bucket, key }))

    expect(presigned.signedHeaders).not.toHaveProperty('Content-Type')
    const fetched = await fetch(presigned.url)
    expect(fetched.status).toBe(200)
    expect(await fetched.text()).toBe(content)
  })

  // The capability settles a type for requests this client sends itself, never for a url it hands over.
  it('serves a url a filling transport presigned to a caller that sends no content type', async () => {
    const presigned = await filling.presign(new GetObject({ bucket, key }))

    expect(presigned.signedHeaders).not.toHaveProperty('Content-Type')
    const fetched = await fetch(presigned.url)
    expect(fetched.status).toBe(200)
    expect(await fetched.text()).toBe(content)
  })

  it('serves a HeadObject url', async () => {
    const presigned = await client.presign(new HeadObject({ bucket, key }))
    const head = await fetch(presigned.url, { method: 'HEAD' })

    expect(head.status).toBe(200)
    expect(head.headers.get('content-type')).toBe('text/plain')
  })

  it('accepts a PutObject url that signed no content type', async () => {
    const target = uniqueKey('presign-put-plain')
    const presigned = await client.presign(new PutObject({ bucket, key: target }))

    expect(presigned.signedHeaders).not.toHaveProperty('Content-Type')
    const uploaded = await fetch(presigned.url, { method: 'PUT', body: new TextEncoder().encode('uploaded by url') })
    expect(uploaded.status).toBe(200)

    const read = await client.send(new GetObject({ bucket, key: target }))
    expect(await read.body?.text()).toBe('uploaded by url')
  })

  // A type the caller asked for is a signed header, so the upload has to repeat it.
  it('rejects a PutObject upload that drops the content type it signed', async () => {
    const signed = await client.presign(new PutObject({ bucket, key: uniqueKey('presign-put-type'), contentType: 'text/plain' }))
    expect(signed.signedHeaders).toHaveProperty('Content-Type', 'text/plain')

    const dropped = await fetch(signed.url, { method: 'PUT', body: new TextEncoder().encode('dropped') })
    expect(dropped.status).toBe(403)
    expect(await dropped.text()).toContain('SignatureDoesNotMatch')
  })

  it('accepts a PutObject upload that repeats the content type it signed', async () => {
    const target = uniqueKey('presign-put-kept')
    const presigned = await client.presign(new PutObject({ bucket, key: target, contentType: 'text/plain' }))

    const uploaded = await fetch(presigned.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: new TextEncoder().encode('kept'),
    })
    expect(uploaded.status).toBe(200)

    const read = await client.send(new GetObject({ bucket, key: target }))
    expect(read.contentType).toBe('text/plain')
  })

  // The signed date has second granularity, so a url keeps serving shortly after its expiry; this waits
  // several times past it rather than sitting on the boundary.
  it('stops serving a url once its expiry passes', async () => {
    const presigned = await client.presign(new GetObject({ bucket, key }), { expiresInSeconds: 1 })
    await new Promise<void>((resolve) => setTimeout(resolve, 3000))

    const fetched = await fetch(presigned.url)
    expect(fetched.status).toBe(403)
    expect(await fetched.text()).toContain('AccessDenied')
  })
})
