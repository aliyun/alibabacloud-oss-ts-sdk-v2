import { describe, expect, it } from 'vitest'
import {
  ListBucketsPaginator,
  ListMultipartUploadsPaginator,
  ListObjectVersionsPaginator,
  ListObjectsPaginator,
  ListObjectsV2Paginator,
  ListPartsPaginator,
} from '../../../src/paginator/index.js'
import type { Command, OperationOptions, PaginatorClient } from '../../../src/types.js'

// Fills the ResultModel envelope every page must carry; the fields that drive the walk
// (`isTruncated` and the `next*` cursors) are set per case, not here.
function page<T>(fields: T): T & { status: string; statusCode: number; requestId: string; headers: Record<string, string> } {
  return { status: 'OK', statusCode: 200, requestId: 'req', headers: {}, ...fields }
}

// Records the request each `send` receives and replays a queue of pages, so a test can assert both
// what came back and how the cursor was rewritten between calls.
class RecordingClient implements PaginatorClient {
  readonly inputs: unknown[] = []
  readonly options: (OperationOptions | undefined)[] = []
  private index = 0
  constructor(private readonly pages: unknown[]) {}
  send<I, O>(command: Command<I, O>, options?: OperationOptions): Promise<O> {
    this.inputs.push({ ...(command.input as Record<string, unknown>) })
    this.options.push(options)
    return Promise.resolve(this.pages[this.index++] as O)
  }
}

async function drain<O>(pages: AsyncGenerator<O>): Promise<O[]> {
  const out: O[] = []
  for await (const p of pages) out.push(p)
  return out
}

describe('ListObjectsV2Paginator', () => {
  it('yields one page and stops when the result is not truncated', async () => {
    const client = new RecordingClient([page({ isTruncated: false })])
    const pages = await drain(new ListObjectsV2Paginator({ bucket: 'b' }).pages(client))
    expect(pages).toHaveLength(1)
    expect(client.inputs).toEqual([{ bucket: 'b' }])
  })

  it('follows nextContinuationToken across pages until truncation ends', async () => {
    const client = new RecordingClient([
      page({ isTruncated: true, nextContinuationToken: 'tok-2' }),
      page({ isTruncated: false }),
    ])
    const pages = await drain(new ListObjectsV2Paginator({ bucket: 'b' }).pages(client))
    expect(pages).toHaveLength(2)
    expect(client.inputs).toEqual([{ bucket: 'b' }, { bucket: 'b', continuationToken: 'tok-2' }])
  })

  it('overrides maxKeys with the limit option', async () => {
    const client = new RecordingClient([page({ isTruncated: false })])
    await drain(new ListObjectsV2Paginator({ bucket: 'b', maxKeys: 10 }, { limit: 3 }).pages(client))
    expect(client.inputs).toEqual([{ bucket: 'b', maxKeys: 3 }])
  })

  it('passes the operation options through to every send', async () => {
    const client = new RecordingClient([
      page({ isTruncated: true, nextContinuationToken: 'tok-2' }),
      page({ isTruncated: false }),
    ])
    const options: OperationOptions = { retryMaxAttempts: 5 }
    await drain(new ListObjectsV2Paginator({ bucket: 'b' }).pages(client, options))
    expect(client.options).toEqual([options, options])
  })

  // The generator `pages` returns is single-use, but the paginator instance keeps no state, so a
  // second walk starts from the untouched input rather than the cursor the first walk ended on.
  it('is a reusable object whose second walk restarts from the original input', async () => {
    const paginator = new ListObjectsV2Paginator({ bucket: 'b' })
    const client = new RecordingClient([
      page({ isTruncated: true, nextContinuationToken: 'tok-2' }),
      page({ isTruncated: false }),
      page({ isTruncated: true, nextContinuationToken: 'tok-2' }),
      page({ isTruncated: false }),
    ])
    const first = await drain(paginator.pages(client))
    const second = await drain(paginator.pages(client))
    expect(first).toHaveLength(2)
    expect(second).toHaveLength(2)
    expect(client.inputs).toEqual([
      { bucket: 'b' },
      { bucket: 'b', continuationToken: 'tok-2' },
      { bucket: 'b' },
      { bucket: 'b', continuationToken: 'tok-2' },
    ])
  })
})

describe('ListObjectsPaginator', () => {
  it('follows the marker cursor and overrides maxKeys with the limit', async () => {
    const client = new RecordingClient([page({ isTruncated: true, nextMarker: 'm-2' }), page({ isTruncated: false })])
    await drain(new ListObjectsPaginator({ bucket: 'b', maxKeys: 10 }, { limit: 4 }).pages(client))
    expect(client.inputs).toEqual([
      { bucket: 'b', maxKeys: 4 },
      { bucket: 'b', maxKeys: 4, marker: 'm-2' },
    ])
  })
})

describe('ListObjectVersionsPaginator', () => {
  it('follows both the key and version-id cursors and overrides maxKeys', async () => {
    const client = new RecordingClient([
      page({ isTruncated: true, nextKeyMarker: 'k-2', nextVersionIdMarker: 'v-2' }),
      page({ isTruncated: false }),
    ])
    await drain(new ListObjectVersionsPaginator({ bucket: 'b' }, { limit: 2 }).pages(client))
    expect(client.inputs).toEqual([
      { bucket: 'b', maxKeys: 2 },
      { bucket: 'b', maxKeys: 2, keyMarker: 'k-2', versionIdMarker: 'v-2' },
    ])
  })
})

describe('ListMultipartUploadsPaginator', () => {
  it('follows both the key and upload-id cursors and overrides maxUploads', async () => {
    const client = new RecordingClient([
      page({ isTruncated: true, nextKeyMarker: 'k-2', nextUploadIdMarker: 'u-2' }),
      page({ isTruncated: false }),
    ])
    await drain(new ListMultipartUploadsPaginator({ bucket: 'b' }, { limit: 5 }).pages(client))
    expect(client.inputs).toEqual([
      { bucket: 'b', maxUploads: 5 },
      { bucket: 'b', maxUploads: 5, keyMarker: 'k-2', uploadIdMarker: 'u-2' },
    ])
  })
})

describe('ListPartsPaginator', () => {
  it('follows the partNumberMarker cursor and overrides maxParts', async () => {
    const client = new RecordingClient([
      page({ isTruncated: true, nextPartNumberMarker: 3 }),
      page({ isTruncated: false }),
    ])
    await drain(new ListPartsPaginator({ bucket: 'b', key: 'k', uploadId: 'u' }, { limit: 2 }).pages(client))
    expect(client.inputs).toEqual([
      { bucket: 'b', key: 'k', uploadId: 'u', maxParts: 2 },
      { bucket: 'b', key: 'k', uploadId: 'u', maxParts: 2, partNumberMarker: 3 },
    ])
  })
})

describe('ListBucketsPaginator', () => {
  it('follows the marker cursor and overrides maxKeys with the limit', async () => {
    const client = new RecordingClient([page({ isTruncated: true, nextMarker: 'm-2' }), page({ isTruncated: false })])
    await drain(new ListBucketsPaginator({}, { limit: 6 }).pages(client))
    expect(client.inputs).toEqual([{ maxKeys: 6 }, { maxKeys: 6, marker: 'm-2' }])
  })
})
