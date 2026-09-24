import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PutObject, ServiceError } from '../../src/index.js'
import { failure, live, liveBucket, liveClient, uniqueKey } from './fixtures/live.js'

const bucket = liveBucket()

describe.skipIf(!live)('resource existence', () => {
  const client = liveClient()
  const key = uniqueKey('exists')
  const missing = uniqueKey('missing') + '/nope.txt'

  it('reports existing objects and buckets', async () => {
    await client.send(new PutObject({ bucket, key, body: 'exists' }))

    await expect(client.isObjectExist(bucket, key)).resolves.toBe(true)
    await expect(client.isBucketExist(bucket)).resolves.toBe(true)
  })

  it('reports missing objects and buckets', async () => {
    await expect(client.isObjectExist(bucket, missing)).resolves.toBe(false)
    await expect(client.isBucketExist('ts-sdk-v2-no-such-bucket-' + String(Date.now()))).resolves.toBe(false)
  })

  it('reports NoSuchBucket while checking an object', async () => {
    const error = await failure(
      client.isObjectExist('ts-sdk-v2-no-such-bucket-' + String(Date.now()), missing),
      ServiceError,
    )

    expect(error.code).toBe('NoSuchBucket')
  })
})

describe.skipIf(!live)('resource existence with invalid credentials', () => {
  const wrongId = liveClient({ id: 'invalid-ak', secret: 'invalid-sk' })

  it('propagates an invalid access key for an object and establishes the bucket exists', async () => {
    const error = await failure(wrongId.isObjectExist(bucket, uniqueKey('invalid-credentials')), ServiceError)

    expect(error.code).toBe('InvalidAccessKeyId')
    await expect(wrongId.isBucketExist(bucket)).resolves.toBe(true)
  })
})

describe.skipIf(!live)('Node Client file operations', () => {
  const client = liveClient()
  const key = uniqueKey('file') + '/payload.txt'

  it('uploads from and downloads to a local file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'oss-node-client-it-'))
    const source = join(dir, 'source.txt')
    const target = join(dir, 'target.txt')
    try {
      writeFileSync(source, 'node file operation')

      const uploaded = await client.putObjectFromFile({ bucket, key }, source)
      const downloaded = await client.getObjectToFile({ bucket, key }, target)

      expect(uploaded.statusCode).toBe(200)
      expect(readFileSync(target, 'utf8')).toBe('node file operation')
      expect(downloaded.body).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
