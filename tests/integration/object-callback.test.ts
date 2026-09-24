import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { CompleteMultipartUpload, InitiateMultipartUpload, PutObject, UploadPart } from '../../src/index.js'
import { live, liveBucket, liveClient, uniqueKey } from './fixtures/live.js'

const bucket = liveBucket()

const callbackJson = JSON.stringify({
  callbackUrl: 'http://223.5.5.5',
  callbackBody: 'bucket=${bucket}&object=${object}',
  callbackBodyType: 'application/x-www-form-urlencoded',
})
const callback = Buffer.from(callbackJson, 'utf8').toString('base64')

const PART_SIZE = 100 * 1024

describe.skipIf(!live)('object upload callback against the live service', () => {
  const client = liveClient()
  const prefix = uniqueKey('callback')

  it('PutObject with a callback stores the object and returns the callback failure body', async () => {
    const key = prefix + '/put.txt'
    const result = await client.send(new PutObject({ bucket, key, body: 'hello world', callback }))

    expect(result.statusCode).toBe(203)
    expect(result.callbackResult).toBeDefined()
    expect(result.callbackResult).toContain('CallbackFailed')
  })

  it('CompleteMultipartUpload with a callback assembles the object and returns the callback failure body', async () => {
    const key = prefix + '/complete.bin'
    const initiated = await client.send(new InitiateMultipartUpload({ bucket, key }))
    const uploadId = initiated.uploadId

    const uploaded = await client.send(
      new UploadPart({ bucket, key, uploadId, partNumber: 1, body: 'A'.repeat(PART_SIZE) }),
    )

    const result = await client.send(
      new CompleteMultipartUpload({
        bucket,
        key,
        uploadId,
        parts: [{ partNumber: 1, etag: uploaded.etag }],
        callback,
      }),
    )

    expect(result.statusCode).toBe(203)
    expect(result.callbackResult).toBeDefined()
    expect(result.callbackResult).toContain('CallbackFailed')
    // The callback reply replaces the Complete XML, so the assembled-object fields stay absent.
    expect(result.etag).toBeUndefined()
  })
})
