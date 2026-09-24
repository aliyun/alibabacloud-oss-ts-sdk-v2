import { ListObjectVersions } from '../api/bucket-versioning.js'
import type { ListObjectVersionsRequest, ListObjectVersionsResult } from '../models/bucket-versioning.js'
import type { OperationOptions, Paginator, PaginatorClient, PaginatorOptions } from '../types.js'
import { shallowClone } from '../utils/record.js'

/** Iterates every version and delete marker in a bucket, following the key and version-id cursors. */
export class ListObjectVersionsPaginator implements Paginator<ListObjectVersionsResult> {
  readonly input: ListObjectVersionsRequest
  private readonly options?: PaginatorOptions

  constructor(input: ListObjectVersionsRequest, options?: PaginatorOptions) {
    this.input = input
    this.options = options
  }

  async *pages(client: PaginatorClient, options?: OperationOptions): AsyncGenerator<ListObjectVersionsResult> {
    const req = shallowClone(this.input)
    if (this.options?.limit !== undefined) req.maxKeys = this.options.limit
    for (;;) {
      const result = await client.send(new ListObjectVersions(req), options)
      yield result
      if (result.isTruncated !== true) return
      req.keyMarker = result.nextKeyMarker
      req.versionIdMarker = result.nextVersionIdMarker
    }
  }
}
