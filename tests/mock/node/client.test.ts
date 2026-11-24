import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GetObject, PutObject } from '../../../src/api/object-basic.js'
import { Client } from '../../../src/client.js'
import { StaticCredentialsProvider } from '../../../src/credentials/static.js'
import { OperationError, ServiceError } from '../../../src/error/types.js'
import { FixedDelayBackoff } from '../../../src/retry/backoff.js'
import { StandardRetryer } from '../../../src/retry/standard.js'
import { ListObjectsV2Paginator } from '../../../src/paginator/bucket-basic.js'
import { utf8Decode } from '../../../src/utils/bytes.js'
import { MockOssServer } from '../support/server.js'

const BUCKET = 'mock-bucket'

/**
 * Each half is bigger than one socket read can carry, so the client cannot see them as a single piece
 * unless it buffers the whole response before handing it over.
 */
const STREAM_FIRST = 'a'.repeat(256 * 1024)
const STREAM_SECOND = 'b'.repeat(256 * 1024)

const PAGE_1 = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<ListBucketResult>',
  '<Name>mock-bucket</Name><Prefix>dir/</Prefix><MaxKeys>1</MaxKeys>',
  '<IsTruncated>true</IsTruncated><NextContinuationToken>tok-2</NextContinuationToken>',
  '<Contents><Key>dir/a.txt</Key><Size>3</Size><StorageClass>Standard</StorageClass></Contents>',
  '</ListBucketResult>',
].join('')

const PAGE_2 = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<ListBucketResult>',
  '<Name>mock-bucket</Name><Prefix>dir/</Prefix><MaxKeys>1</MaxKeys>',
  '<ContinuationToken>tok-2</ContinuationToken><IsTruncated>false</IsTruncated><KeyCount>1</KeyCount>',
  '<Contents><Key>dir/b.txt</Key><Size>4</Size><StorageClass>IA</StorageClass></Contents>',
  '</ListBucketResult>',
].join('')

const NO_SUCH_KEY = [
  '<Error>',
  '<Code>NoSuchKey</Code>',
  '<Message>The specified key does not exist.</Message>',
  '<RequestId>req-404</RequestId>',
  '<HostId>mock-bucket.oss-cn-beijing.aliyuncs.com</HostId>',
  '</Error>',
].join('')

const INTERNAL_ERROR = '<Error><Code>InternalError</Code><Message>Server error.</Message></Error>'

let server: MockOssServer

beforeEach(async () => {
  server = new MockOssServer()
  await server.start()
})

afterEach(async () => {
  await server.stop()
})

/** An IP endpoint forces path-style addressing, so the bucket leads the pathname. */
function clientFor(): Client {
  return new Client({
    region: 'cn-beijing',
    endpoint: server.endpoint,
    credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
    retryer: new StandardRetryer({ maxAttempts: 3, backoff: new FixedDelayBackoff(0) }),
  })
}

describe('node mock: client through the real transport', () => {
  it('sends a signed PutObject and reads its result headers', async () => {
    const path = '/' + BUCKET + '/dir/hello.json'
    server.on(
      { method: 'PUT', path },
      { status: 200, headers: { ETag: '"etag-1"', 'x-oss-hash-crc64ecma': '17014118346046923174' } },
    )

    const result = await clientFor().send(new PutObject({ bucket: BUCKET, key: 'dir/hello.json', body: '{"a":1}' }))

    const sent = server.requestsFor('PUT', path)
    expect(sent.length).toBe(1)
    expect(sent[0]?.body).toBe('{"a":1}')
    expect(sent[0]?.headers['content-type']).toBe('application/json')
    expect(sent[0]?.headers['content-length']).toBe('7')
    expect(sent[0]?.headers['authorization']).toMatch(/^OSS4-HMAC-SHA256 Credential=ak\//)
    expect(sent[0]?.headers['x-oss-content-sha256']).toBe('UNSIGNED-PAYLOAD')
    expect(result.statusCode).toBe(200)
    expect(result.requestId).toBe('mock-request-id')
    expect(result.etag).toBe('"etag-1"')
    expect(result.hashCrc64ecma).toBe('17014118346046923174')
  })

  it('reads a GetObject body from the stream as the chunks land', async () => {
    const path = '/' + BUCKET + '/dir/stream.txt'
    server.on({ method: 'GET', path }, { chunks: [STREAM_FIRST, STREAM_SECOND] })

    const result = await clientFor().send(new GetObject({ bucket: BUCKET, key: 'dir/stream.txt' }))

    expect(result.statusCode).toBe(200)
    const parts: string[] = []
    const stream = result.body!.stream()
    for (;;) {
      const chunk = await stream.read()
      if (chunk === null) break
      parts.push(utf8Decode(chunk))
    }
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.join('')).toBe(STREAM_FIRST + STREAM_SECOND)
    expect(server.requestsFor('GET', path).length).toBe(1)
  })

  it('walks ListObjectsV2 pages until the cursor runs out', async () => {
    const path = '/' + BUCKET + '/'
    server.on({ method: 'GET', path, query: { 'continuation-token': 'tok-2' } }, { body: PAGE_2 })
    server.on({ method: 'GET', path }, { body: PAGE_1 })

    const keys: string[] = []
    let pages = 0
    for await (const page of clientFor().paginate(new ListObjectsV2Paginator({ bucket: BUCKET, maxKeys: 1 }))) {
      pages += 1
      for (const object of page.contents ?? []) keys.push(object.key ?? '')
    }

    const sent = server.requestsFor('GET', path)
    expect(pages).toBe(2)
    expect(keys).toEqual(['dir/a.txt', 'dir/b.txt'])
    expect(sent.length).toBe(2)
    expect(sent[0]?.query['list-type']).toBe('2')
    expect(sent[0]?.query['max-keys']).toBe('1')
    expect(sent[0]?.query['continuation-token']).toBeUndefined()
    expect(sent[1]?.query['continuation-token']).toBe('tok-2')
  })

  it('maps a 404 to a ServiceError without retrying', async () => {
    const path = '/' + BUCKET + '/dir/missing.txt'
    server.on(
      { method: 'GET', path },
      { status: 404, headers: { 'x-oss-request-id': 'req-404' }, body: NO_SUCH_KEY },
    )

    await expect(clientFor().send(new GetObject({ bucket: BUCKET, key: 'dir/missing.txt' })))
      .rejects.toSatisfy((error: Error) => {
        if (!(error instanceof OperationError)) return false
        const service = error.contains((cause) => cause instanceof ServiceError)
        return (
          service instanceof ServiceError &&
          service.code === 'NoSuchKey' &&
          service.statusCode === 404 &&
          service.requestId === 'req-404'
        )
      })
    expect(server.requestsFor('GET', path).length).toBe(1)
  })

  it('retries a 503 and returns the response of the later attempt', async () => {
    const path = '/' + BUCKET + '/dir/flaky.txt'
    server.on({ method: 'PUT', path }, { status: 503, body: INTERNAL_ERROR }, { status: 200, headers: { ETag: '"etag-2"' } })

    const result = await clientFor().send(new PutObject({ bucket: BUCKET, key: 'dir/flaky.txt', body: 'retry me' }))

    const sent = server.requestsFor('PUT', path)
    expect(result.statusCode).toBe(200)
    expect(result.etag).toBe('"etag-2"')
    expect(sent.length).toBe(2)
    expect(sent[0]?.body).toBe('retry me')
    expect(sent[1]?.body).toBe('retry me')
  })
})
