import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DeleteBucket,
  DeleteObject,
  GetBucketAcl,
  GetBucketInfo,
  GetBucketLocation,
  GetBucketReferer,
  GetBucketStat,
  GetBucketVersioning,
  ListObjects,
  ListObjectVersions,
  PutBucket,
  PutBucketAcl,
  PutBucketReferer,
  PutBucketVersioning,
  PutObject,
} from '../../src/index.js'
import { live, liveBucket, liveClient, uniqueKey } from './fixtures/live.js'

const bucket = liveBucket()

describe.skipIf(!live)('bucket configuration against the live service', () => {
  const client = liveClient()

  it('GetBucketInfo reports the name, storage class and owner of the bucket', async () => {
    const result = await client.send(new GetBucketInfo({ bucket }))

    expect(result.statusCode).toBe(200)
    expect(result.bucketInfo?.name).toBe(bucket)
    expect(result.bucketInfo?.storageClass).toMatch(/^(Standard|IA|Archive|ColdArchive|DeepColdArchive)$/)
    expect(result.bucketInfo?.owner?.id).toBeDefined()
    // A freshly created bucket is private until PutBucketAcl says otherwise.
    expect(result.bucketInfo?.accessControlList?.grant).toBe('private')
  })

  it('GetBucketLocation reports the region the bucket lives in', async () => {
    const result = await client.send(new GetBucketLocation({ bucket }))

    expect(result.statusCode).toBe(200)
    expect(result.locationConstraint).toMatch(/^oss-/)
  })

  it('GetBucketStat reports storage usage and object counts as numbers', async () => {
    const result = await client.send(new GetBucketStat({ bucket }))

    expect(result.statusCode).toBe(200)
    expect(typeof result.bucketStat?.storage).toBe('number')
    expect(typeof result.bucketStat?.objectCount).toBe('number')
  })

  it('ListObjects finds an object under its prefix, V1 style', async () => {
    const prefix = uniqueKey('v1list')
    const key = prefix + '/hello.txt'
    await client.send(new PutObject({ bucket, key, body: 'v1 body' }))

    const result = await client.send(new ListObjects({ bucket, prefix, maxKeys: 10 }))

    expect(result.statusCode).toBe(200)
    expect(result.name).toBe(bucket)
    expect(result.prefix).toBe(prefix)
    expect(result.contents?.map((each) => each.key)).toContain(key)
  })

  it('sets the bucket ACL and reads it back', async () => {
    const put = await client.send(new PutBucketAcl({ bucket, acl: 'private' }))
    expect(put.statusCode).toBe(200)

    const got = await client.send(new GetBucketAcl({ bucket }))
    expect(got.accessControlPolicy?.accessControlList?.grant).toBe('private')
    expect(got.accessControlPolicy?.owner?.id).toBeDefined()
  })

  it('sets a Referer whitelist and reads the configuration back', async () => {
    const put = await client.send(
      new PutBucketReferer({
        bucket,
        refererConfiguration: {
          allowEmptyReferer: true,
          refererList: { referers: ['https://www.example.com'] },
        },
      }),
    )
    expect(put.statusCode).toBe(200)

    const got = await client.send(new GetBucketReferer({ bucket }))
    expect(got.refererConfiguration?.allowEmptyReferer).toBe(true)
    expect(got.refererConfiguration?.refererList?.referers).toContain('https://www.example.com')
  })
})

describe.skipIf(!live)('bucket versioning against the live service', () => {
  const client = liveClient()
  // A versioned bucket cannot be emptied by deleting current versions alone, so `liveBucket`'s
  // teardown does not fit: this suite owns a bucket and clears every version and delete marker before
  // dropping it.
  const versioned =
    'oss-sdk-test-ts-ver-' + Math.random().toString(36).slice(2, 6) + '-' + String(Math.floor(Date.now() / 1000))
  let created = false

  beforeAll(async () => {
    if (!live) return
    await client.send(new PutBucket({ bucket: versioned }))
    created = true
  })

  afterAll(async () => {
    if (!created) return
    try {
      let keyMarker: string | undefined
      let versionIdMarker: string | undefined
      do {
        const page = await client.send(new ListObjectVersions({ bucket: versioned, keyMarker, versionIdMarker }))
        for (const each of [...(page.versions ?? []), ...(page.deleteMarkers ?? [])]) {
          if (each.key === undefined) continue
          await client.send(new DeleteObject({ bucket: versioned, key: each.key, versionId: each.versionId }))
        }
        keyMarker = page.isTruncated === true ? page.nextKeyMarker : undefined
        versionIdMarker = page.isTruncated === true ? page.nextVersionIdMarker : undefined
      } while (keyMarker !== undefined)
      await client.send(new DeleteBucket({ bucket: versioned }))
    } catch (err) {
      throw new Error('cleanup failed, bucket ' + versioned + ' may still exist: ' + String(err))
    }
  })

  // These three read what the ones before them wrote, so the suite relies on vitest's in-file order.
  it('reports no versioning on a fresh bucket', async () => {
    const result = await client.send(new GetBucketVersioning({ bucket: versioned }))

    expect(result.statusCode).toBe(200)
    expect(result.versioningConfiguration?.status).toBeUndefined()
  })

  it('enables versioning and reads the state back', async () => {
    const put = await client.send(
      new PutBucketVersioning({ bucket: versioned, versioningConfiguration: { status: 'Enabled' } }),
    )
    expect(put.statusCode).toBe(200)

    const got = await client.send(new GetBucketVersioning({ bucket: versioned }))
    expect(got.versioningConfiguration?.status).toBe('Enabled')
  })

  it('ListObjectVersions lists both versions of an overwritten object', async () => {
    const key = uniqueKey('versioned') + '/obj.txt'
    await client.send(new PutObject({ bucket: versioned, key, body: 'v1' }))
    await client.send(new PutObject({ bucket: versioned, key, body: 'v2' }))

    const result = await client.send(new ListObjectVersions({ bucket: versioned, prefix: key }))

    expect(result.statusCode).toBe(200)
    const mine = (result.versions ?? []).filter((each) => each.key === key)
    expect(mine.length).toBeGreaterThanOrEqual(2)
    expect(mine.some((each) => each.isLatest === true)).toBe(true)
    expect(mine.every((each) => typeof each.versionId === 'string')).toBe(true)
  })
})
