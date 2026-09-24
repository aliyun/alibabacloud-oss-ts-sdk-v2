import { describe, expect, it } from 'vitest'
import {
  ClientErrorRetryable,
  DeleteObject,
  GetObject,
  HeadObject,
  HttpStatusCodeRetryable,
  ListObjectsV2,
  ParamInvalidError,
  ParamRequiredError,
  PutObject,
  ServiceError,
  ServiceErrorCodeRetryable,
} from '../../src/index.js'
import { failure, live, liveBucket, liveClient, uniqueKey } from './fixtures/live.js'

const bucket = liveBucket()

describe.skipIf(!live)('invalid input is rejected before the network', () => {
  // Making no network call is the property under test: `requireField` runs before a request exists.
  const client = liveClient()

  it('PutObject without a bucket raises ParamRequiredError', async () => {
    const error = await failure(client.send(new PutObject({ key: 'k', body: 'x' })), ParamRequiredError)

    expect(error.field).toBe('bucket')
  })

  it('GetObject without a key raises ParamRequiredError naming the field', async () => {
    const error = await failure(client.send(new GetObject({ bucket })), ParamRequiredError)

    expect(error.field).toBe('key')
  })

  it('an invalid bucket name raises ParamInvalidError', async () => {
    // `verifyOperation` throws outside `invokeOperation`'s try, so this arrives bare, not wrapped.
    const error = await failure(
      client.send(new GetObject({ bucket: 'Invalid_Bucket_Name', key: 'k' })),
      ParamInvalidError,
    )

    expect(error.field).toBe('bucket')
  })
})

describe.skipIf(!live)('resources that do not exist', () => {
  const client = liveClient()
  // Unique prefix, so a key another run creates cannot turn "missing" into "present".
  const missing = uniqueKey('missing') + '/nope.txt'

  it('GetObject on a missing key is a 404 NoSuchKey carrying a request id', async () => {
    const error = await failure(client.send(new GetObject({ bucket, key: missing })), ServiceError)

    expect(error.statusCode).toBe(404)
    expect(error.code).toBe('NoSuchKey')
    expect(error.requestId.length).toBeGreaterThan(0)
    // Every `ec` here is measured against the live service.
    expect(error.ec).toBe('0026-00000001')
  })

  it('HeadObject on a missing key is a 404 NoSuchKey recovered from the x-oss-err header', async () => {
    const error = await failure(client.send(new HeadObject({ bucket, key: missing })), ServiceError)

    expect(error.statusCode).toBe(404)
    expect(error.requestId.length).toBeGreaterThan(0)
    expect(error.ec).toBe('0026-00000001')
    // A HEAD carries no body, so `'NoSuchKey'` can only come from base64-decoding `x-oss-err`.
    expect(error.code).toBe('NoSuchKey')
  })

  it('DeleteObject on a missing key succeeds with 204', async () => {
    // DeleteObject is idempotent: 204 whether or not the key existed.
    const result = await client.send(new DeleteObject({ bucket, key: missing }))

    expect(result.statusCode).toBe(204)
    // Checks the bucket is unversioned: a versioned one would leave a delete marker v0.1 cannot remove.
    expect(result.deleteMarker).toBeUndefined()
  })

  it('ListObjectsV2 on a prefix that matches nothing returns no contents', async () => {
    const result = await client.send(new ListObjectsV2({ bucket, prefix: uniqueKey('empty') }))

    expect(result.statusCode).toBe(200)
    // Absent, not `[]`: `deserializeListObjectsV2` maps an empty repeated element to `undefined`.
    expect(result.contents).toBeUndefined()
    expect(result.isTruncated).toBe(false)
    expect(result.keyCount).toBe(0)
  })

  it('a bucket that does not exist is NoSuchBucket', async () => {
    const error = await failure(
      client.send(new ListObjectsV2({ bucket: 'ts-sdk-v2-no-such-bucket-' + String(Date.now()) })),
      ServiceError,
    )

    expect(error.code).toBe('NoSuchBucket')
    expect(error.requestId.length).toBeGreaterThan(0)
    expect(error.ec).toBe('0015-00000101')
  })
})

describe.skipIf(!live)('invalid credentials', () => {
  // The environment's own region and endpoint, so a 403 cannot be a wrong-host request.
  const wrongId = liveClient({ id: 'invalid-ak', secret: 'invalid-sk' })
  const wrongSecret = liveClient({ secret: 'invalid-sk' })

  it('a wrong access key id is InvalidAccessKeyId, not a retried timeout', async () => {
    const error = await failure(wrongId.send(new ListObjectsV2({ bucket })), ServiceError)

    expect(error.statusCode).toBe(403)
    expect(error.code).toBe('InvalidAccessKeyId')
    expect(error.requestId.length).toBeGreaterThan(0)
    expect(error.ec).toBe('0002-00000902')
    expect(new HttpStatusCodeRetryable().isErrorRetryable(error)).toBe(false)
    expect(new ServiceErrorCodeRetryable().isErrorRetryable(error)).toBe(false)
    expect(new ClientErrorRetryable().isErrorRetryable(error)).toBe(false)
  })

  it('a correct id with a wrong secret is SignatureDoesNotMatch', async () => {
    const error = await failure(wrongSecret.send(new ListObjectsV2({ bucket })), ServiceError)

    expect(error.statusCode).toBe(403)
    expect(error.code).toBe('SignatureDoesNotMatch')
    expect(error.requestId.length).toBeGreaterThan(0)
    expect(error.ec).toBe('0002-00000201')
  })
})
