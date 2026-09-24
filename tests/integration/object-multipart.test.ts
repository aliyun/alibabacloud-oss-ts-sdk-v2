import { describe, expect, it } from 'vitest'
import {
  AbortMultipartUpload,
  CompleteMultipartUpload,
  GetObject,
  InitiateMultipartUpload,
  ListMultipartUploads,
  ListParts,
  PutObject,
  ServiceError,
  UploadPart,
  UploadPartCopy,
} from '../../src/index.js'
import { failure, live, liveBucket, liveClient, uniqueKey } from './fixtures/live.js'

const bucket = liveBucket()

// A part below the last must be at least 100 KiB, so the two leading parts are padded to that size
// and only the final part may be short.
const PART_SIZE = 100 * 1024

describe.skipIf(!live)('object multipart against the live service', () => {
  const client = liveClient()
  const prefix = uniqueKey('multipart')
  const key = prefix + '/assembled.bin'

  const partA = 'A'.repeat(PART_SIZE)
  const partB = 'B'.repeat(PART_SIZE)
  const partC = 'tail'
  const whole = partA + partB + partC

  it('runs an upload from initiate through complete and reads the assembled object back', async () => {
    const initiated = await client.send(new InitiateMultipartUpload({ bucket, key }))
    expect(initiated.statusCode).toBe(200)
    expect(initiated.uploadId).toBeDefined()
    const uploadId = initiated.uploadId

    const bodies = [partA, partB, partC]
    const parts = []
    for (let i = 0; i < bodies.length; i++) {
      const uploaded = await client.send(
        new UploadPart({ bucket, key, uploadId, partNumber: i + 1, body: bodies[i] }),
      )
      expect(uploaded.etag).toBeDefined()
      parts.push({ partNumber: i + 1, etag: uploaded.etag })
    }

    const listed = await client.send(new ListParts({ bucket, key, uploadId }))
    expect(listed.parts?.length).toBe(3)
    expect(listed.parts?.[0]?.size).toBe(PART_SIZE)

    const completed = await client.send(new CompleteMultipartUpload({ bucket, key, uploadId, parts }))
    expect(completed.statusCode).toBe(200)
    expect(completed.key).toBe(key)
    expect(completed.etag).toBeDefined()

    const read = await client.send(new GetObject({ bucket, key }))
    expect(await read.body?.text()).toBe(whole)
  })

  it('lists an in-progress upload and then aborts it', async () => {
    const abortKey = prefix + '/aborted.bin'
    const initiated = await client.send(new InitiateMultipartUpload({ bucket, key: abortKey }))
    const uploadId = initiated.uploadId

    const listed = await client.send(new ListMultipartUploads({ bucket, prefix }))
    expect(listed.uploads?.map((each) => each.uploadId)).toContain(uploadId)

    const aborted = await client.send(new AbortMultipartUpload({ bucket, key: abortKey, uploadId }))
    expect(aborted.statusCode).toBe(204)

    // Listing the aborted upload's parts now fails: the upload id is gone.
    const error = await failure(client.send(new ListParts({ bucket, key: abortKey, uploadId })), ServiceError)
    expect(error.code).toBe('NoSuchUpload')
  })

  it('UploadPartCopy assembles an object from a range of an existing one', async () => {
    const sourceKey = prefix + '/source.bin'
    const copyKey = prefix + '/copied.bin'
    await client.send(new PutObject({ bucket, key: sourceKey, body: whole }))

    const initiated = await client.send(new InitiateMultipartUpload({ bucket, key: copyKey }))
    const uploadId = initiated.uploadId

    const copied = await client.send(
      new UploadPartCopy({
        bucket,
        key: copyKey,
        uploadId,
        partNumber: 1,
        sourceKey,
        copySourceRange: 'bytes=0-' + String(PART_SIZE - 1),
      }),
    )
    expect(copied.etag).toBeDefined()

    await client.send(
      new CompleteMultipartUpload({
        bucket,
        key: copyKey,
        uploadId,
        parts: [{ partNumber: 1, etag: copied.etag }],
      }),
    )

    const read = await client.send(new GetObject({ bucket, key: copyKey }))
    expect(await read.body?.text()).toBe(partA)
  })
})
