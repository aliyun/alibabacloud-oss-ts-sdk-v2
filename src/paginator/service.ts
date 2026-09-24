import { ListBuckets } from '../api/service.js'
import type { ListBucketsRequest, ListBucketsResult } from '../models/service.js'
import type { OperationOptions, Paginator, PaginatorClient, PaginatorOptions } from '../types.js'
import { shallowClone } from '../utils/record.js'

/** Iterates the buckets an account owns, following the `marker` cursor. */
export class ListBucketsPaginator implements Paginator<ListBucketsResult> {
  readonly input: ListBucketsRequest
  private readonly options?: PaginatorOptions

  constructor(input: ListBucketsRequest, options?: PaginatorOptions) {
    this.input = input
    this.options = options
  }

  async *pages(client: PaginatorClient, options?: OperationOptions): AsyncGenerator<ListBucketsResult> {
    const req = shallowClone(this.input)
    if (this.options?.limit !== undefined) req.maxKeys = this.options.limit
    for (;;) {
      const result = await client.send(new ListBuckets(req), options)
      yield result
      if (result.isTruncated !== true) return
      req.marker = result.nextMarker
    }
  }
}
