import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  AsyncProcessObject,
  HeadObject,
  OperationError,
  ParamRequiredError,
  ProcessObject,
  PutObject,
  ServiceError,
} from '../../src/index.js'
import { failure, live, liveBucket, liveClient, uniqueKey } from './fixtures/live.js'

const bucket = liveBucket()

// Standard base64, matching the cpp SDK's `Base64Encode` used to build the same `sys/saveas` params.
function base64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

function saveAs(target: string): string {
  return 'sys/saveas,o_' + base64(target) + ',b_' + base64(bucket)
}

describe.skipIf(!live)('object processing against the live service', () => {
  const client = liveClient()
  const source = uniqueKey('process') + '/source.jpg'

  beforeAll(async () => {
    const image = new Uint8Array(readFileSync(new URL('./fixtures/example.jpg', import.meta.url)))
    await client.send(new PutObject({ bucket, key: source, body: image }))
  })

  it('resizes an image and saves it as a new object', async () => {
    const target = uniqueKey('process') + '/target.jpg'
    const process = 'image/resize,w_100|' + saveAs(target)

    const result = await client.send(new ProcessObject({ bucket, key: source, process }))
    expect(result.statusCode).toBe(200)
    // The body is the raw JSON the service returns; parsing it here is the point of the string field.
    const report = JSON.parse(result.body ?? '') as { bucket?: string; object?: string; status?: string }
    expect(report.status).toBe('OK')
    expect(report.bucket).toBe(bucket)
    expect(report.object).toBe(target)

    const head = await client.send(new HeadObject({ bucket, key: target }))
    expect(head.statusCode).toBe(200)
  })

  it('rejects a missing process argument before the network', async () => {
    const error = await failure(client.send(new ProcessObject({ bucket, key: source })), ParamRequiredError)
    expect(error.field).toBe('process')
  })

  it('rejects an unparsable process instruction as a 400', async () => {
    const error = await failure(
      client.send(new ProcessObject({ bucket, key: source, process: 'invalid/process' })),
      ServiceError,
    )
    expect(error.statusCode).toBe(400)
    expect(error.requestId.length).toBeGreaterThan(0)
  })

  it('processing a key that does not exist is a 404 NoSuchKey', async () => {
    const target = uniqueKey('process') + '/target.jpg'
    const missing = uniqueKey('missing') + '/nope.jpg'
    const error = await failure(
      client.send(new ProcessObject({ bucket, key: missing, process: 'image/resize,w_100|' + saveAs(target) })),
      ServiceError,
    )
    expect(error.statusCode).toBe(404)
    expect(error.code).toBe('NoSuchKey')
    expect(error.requestId.length).toBeGreaterThan(0)
  })

  it('a wrong access key id is a 403 InvalidAccessKeyId', async () => {
    const wrong = liveClient({ id: 'invalid-ak', secret: 'invalid-sk' })
    const error = await failure(
      wrong.send(new ProcessObject({ bucket, key: source, process: 'image/resize,w_100' })),
      ServiceError,
    )
    expect(error.statusCode).toBe(403)
    expect(error.code).toBe('InvalidAccessKeyId')
    expect(error.requestId.length).toBeGreaterThan(0)
  })

  it('submits an async media conversion task', async () => {
    const target = uniqueKey('process') + '/target.mp4'
    const process = 'video/convert,f_mp4|' + saveAs(target)

    try {
      const result = await client.send(new AsyncProcessObject({ bucket, key: source, process }))
      const report = JSON.parse(result.body ?? '') as { EventId?: string; RequestId?: string; TaskId?: string }
      expect(report.EventId).toBeDefined()
      expect(report.RequestId).toBeDefined()
      expect(report.TaskId).toBeDefined()
    } catch (err) {
      // An account not enrolled for media processing refuses the task; that refusal is still a
      // well-formed service error, not a client crash.
      const wrapped = err instanceof OperationError ? err.contains((e) => e instanceof ServiceError) : err
      expect(wrapped).toBeInstanceOf(ServiceError)
    }
  })
})
