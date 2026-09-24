// Namespace import: `@types/node` declares `export = process`, a TS1259 without `esModuleInterop`.
import * as process from 'node:process'
import { afterAll, beforeAll } from 'vitest'
import {
  Client,
  DeleteBucket,
  DeleteObject,
  ListObjectsV2,
  OperationError,
  PutBucket,
  StaticCredentialsProvider,
} from '../../../src/index.js'
import { createNodeTransport } from '../../../src/runtime/node/index.js'

const NAMES = ['OSS_TEST_ENDPOINT', 'OSS_TEST_REGION', 'OSS_TEST_ACCESS_KEY_ID', 'OSS_TEST_ACCESS_KEY_SECRET']

function value(name: string): string {
  return process.env[name] ?? ''
}

// `skipIf(!live)` still runs the describe body to collect tests, so a skipped suite calls this with
// an empty env, and `StaticCredentialsProvider` rejects an empty key eagerly.
function valueOr(name: string, placeholder: string): string {
  const found = value(name)
  return found.length > 0 ? found : placeholder
}

export const live = NAMES.every((name) => value(name).length > 0)

export function liveClient(credentials?: { id?: string; secret?: string }): Client {
  return new Client({
    region: value('OSS_TEST_REGION'),
    endpoint: value('OSS_TEST_ENDPOINT'),
    transport: createNodeTransport(),
    credentialsProvider: new StaticCredentialsProvider(
      credentials?.id ?? valueOr('OSS_TEST_ACCESS_KEY_ID', 'unset-suite-is-skipped'),
      credentials?.secret ?? valueOr('OSS_TEST_ACCESS_KEY_SECRET', 'unset-suite-is-skipped'),
    ),
  })
}

export function uniqueKey(label: string): string {
  return 'ts-sdk-v2-it/' + label + '/' + String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10)
}

const BUCKET_PREFIX = 'oss-sdk-test-ts-bucket-'

function randomBucketName(): string {
  let suffix = ''
  for (let i = 0; i < 4; i++) suffix += String.fromCharCode(97 + Math.floor(Math.random() * 26))
  return BUCKET_PREFIX + suffix + '-' + String(Math.floor(Date.now() / 1000))
}

// Only safe on a bucket this run created.
async function emptyBucket(client: Client, bucket: string): Promise<void> {
  let continuationToken: string | undefined
  do {
    const page = await client.send(new ListObjectsV2({ bucket, continuationToken }))
    for (const entry of page.contents ?? []) {
      if (entry.key === undefined) continue
      await client.send(new DeleteObject({ bucket, key: entry.key }))
    }
    continuationToken = page.isTruncated === true ? page.nextContinuationToken : undefined
  } while (continuationToken !== undefined)
}

// Registers hooks that create a bucket for the calling suite and delete it afterwards.
export function liveBucket(): string {
  const bucket = randomBucketName()
  const client = liveClient()
  let created = false

  beforeAll(async () => {
    if (!live) return
    await client.send(new PutBucket({ bucket }))
    created = true
  })

  afterAll(async () => {
    if (!created) return
    try {
      await emptyBucket(client, bucket)
      await client.send(new DeleteBucket({ bucket }))
    } catch (err) {
      throw new Error('cleanup failed, bucket ' + bucket + ' may still exist: ' + String(err))
    }
  })

  return bucket
}

// Returns the error of type `ctor`, whether thrown bare or buried under an `OperationError`.
export async function failure<T extends Error>(
  promise: Promise<unknown>,
  ctor: new (...args: never[]) => T,
): Promise<T> {
  try {
    await promise
  } catch (err) {
    if (err instanceof ctor) {
      return err
    }
    if (err instanceof OperationError) {
      const found = err.contains((e) => e instanceof ctor)
      if (found instanceof ctor) {
        return found
      }
    }
    throw err
  }
  throw new Error('expected the call to reject with ' + ctor.name + ', but it resolved')
}
