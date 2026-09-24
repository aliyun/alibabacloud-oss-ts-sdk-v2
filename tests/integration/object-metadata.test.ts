import { describe, expect, it } from 'vitest'
import {
  DeleteObjectTagging,
  GetObjectAcl,
  GetObjectTagging,
  GetSymlink,
  PutObject,
  PutObjectAcl,
  PutObjectTagging,
  PutSymlink,
} from '../../src/index.js'
import { live, liveBucket, liveClient, uniqueKey } from './fixtures/live.js'

const bucket = liveBucket()

describe.skipIf(!live)('object acl, tagging, and symlink against the live service', () => {
  const client = liveClient()
  const prefix = uniqueKey('metadata')

  it('sets an object ACL and reads it back', async () => {
    const key = prefix + '/acl.txt'
    await client.send(new PutObject({ bucket, key, body: 'acl body' }))

    const put = await client.send(new PutObjectAcl({ bucket, key, objectAcl: 'private' }))
    expect(put.statusCode).toBe(200)

    const got = await client.send(new GetObjectAcl({ bucket, key }))
    expect(got.accessControlPolicy?.accessControlList?.grant).toBe('private')
    expect(got.accessControlPolicy?.owner?.id).toBeDefined()
  })

  it('attaches tags, reads them, and then removes them', async () => {
    const key = prefix + '/tagging.txt'
    await client.send(new PutObject({ bucket, key, body: 'tagging body' }))

    await client.send(
      new PutObjectTagging({
        bucket,
        key,
        tagging: { tagSet: { tags: [{ key: 'env', value: 'test' }, { key: 'team', value: 'oss' }] } },
      }),
    )

    const got = await client.send(new GetObjectTagging({ bucket, key }))
    const tags = got.tagging?.tagSet?.tags ?? []
    expect(tags.length).toBe(2)
    expect(tags.map((each) => each.key)).toEqual(expect.arrayContaining(['env', 'team']))

    const deleted = await client.send(new DeleteObjectTagging({ bucket, key }))
    expect(deleted.statusCode).toBe(204)

    const empty = await client.send(new GetObjectTagging({ bucket, key }))
    expect(empty.tagging?.tagSet?.tags ?? []).toEqual([])
  })

  it('creates a symbolic link and reads the target it points to', async () => {
    // The target must not contain a slash: OSS returns `x-oss-symlink-target` percent-encoded, and
    // GetSymlink hands the header back verbatim, so a `/` would read back as `%2F`.
    const target = 'ts-sdk-v2-it-symlink-target-' + String(Date.now())
    const link = prefix + '/link.txt'
    await client.send(new PutObject({ bucket, key: target, body: 'the target bytes' }))

    const put = await client.send(new PutSymlink({ bucket, key: link, symlinkTarget: target }))
    expect(put.statusCode).toBe(200)

    const got = await client.send(new GetSymlink({ bucket, key: link }))
    expect(got.symlinkTarget).toBe(target)
  })
})
