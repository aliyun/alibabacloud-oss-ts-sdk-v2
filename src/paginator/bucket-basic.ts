import { ListObjects, ListObjectsV2 } from '../api/bucket-basic.js'
import type {
  ListObjectsRequest,
  ListObjectsResult,
  ListObjectsV2Request,
  ListObjectsV2Result,
} from '../models/bucket-basic.js'
import type { OperationOptions, Paginator, PaginatorClient, PaginatorOptions } from '../types.js'
import { shallowClone } from '../utils/record.js'

/** Iterates the objects in a bucket, following the `continuationToken` cursor. */
export class ListObjectsV2Paginator implements Paginator<ListObjectsV2Result> {
  readonly input: ListObjectsV2Request
  private readonly options?: PaginatorOptions

  constructor(input: ListObjectsV2Request, options?: PaginatorOptions) {
    this.input = input
    this.options = options
  }

  async *pages(client: PaginatorClient, options?: OperationOptions): AsyncGenerator<ListObjectsV2Result> {
    const req = shallowClone(this.input)
    if (this.options?.limit !== undefined) req.maxKeys = this.options.limit
    for (;;) {
      const result = await client.send(new ListObjectsV2(req), options)
      yield result
      if (result.isTruncated !== true) return
      req.continuationToken = result.nextContinuationToken
    }
  }
}

/** Iterates the objects in a bucket in the V1 style, following the `marker` cursor. */
export class ListObjectsPaginator implements Paginator<ListObjectsResult> {
  readonly input: ListObjectsRequest
  private readonly options?: PaginatorOptions

  constructor(input: ListObjectsRequest, options?: PaginatorOptions) {
    this.input = input
    this.options = options
  }

  async *pages(client: PaginatorClient, options?: OperationOptions): AsyncGenerator<ListObjectsResult> {
    const req = shallowClone(this.input)
    if (this.options?.limit !== undefined) req.maxKeys = this.options.limit
    for (;;) {
      const result = await client.send(new ListObjects(req), options)
      yield result
      if (result.isTruncated !== true) return
      req.marker = result.nextMarker
    }
  }
}
