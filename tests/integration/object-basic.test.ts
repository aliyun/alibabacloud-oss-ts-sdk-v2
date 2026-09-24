import { describe, expect, it } from 'vitest'
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
} from '../../src/index.js'
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
