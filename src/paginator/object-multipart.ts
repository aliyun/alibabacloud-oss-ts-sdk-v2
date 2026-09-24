import { ListMultipartUploads, ListParts } from '../api/object-multipart.js'
import type {
  ListMultipartUploadsRequest,
  ListMultipartUploadsResult,
  ListPartsRequest,
  ListPartsResult,
} from '../models/object-multipart.js'
import type { OperationOptions, Paginator, PaginatorClient, PaginatorOptions } from '../types.js'
import { shallowClone } from '../utils/record.js'

/** Iterates the in-progress multipart uploads in a bucket, following the key and upload-id cursors. */
export class ListMultipartUploadsPaginator implements Paginator<ListMultipartUploadsResult> {
  readonly input: ListMultipartUploadsRequest
  private readonly options?: PaginatorOptions

  constructor(input: ListMultipartUploadsRequest, options?: PaginatorOptions) {
    this.input = input
    this.options = options
  }

  async *pages(client: PaginatorClient, options?: OperationOptions): AsyncGenerator<ListMultipartUploadsResult> {
    const req = shallowClone(this.input)
    if (this.options?.limit !== undefined) req.maxUploads = this.options.limit
    for (;;) {
      const result = await client.send(new ListMultipartUploads(req), options)
      yield result
      if (result.isTruncated !== true) return
      req.keyMarker = result.nextKeyMarker
      req.uploadIdMarker = result.nextUploadIdMarker
    }
  }
}

/** Iterates the uploaded parts of a multipart upload, following the `partNumberMarker` cursor. */
export class ListPartsPaginator implements Paginator<ListPartsResult> {
  readonly input: ListPartsRequest
  private readonly options?: PaginatorOptions

  constructor(input: ListPartsRequest, options?: PaginatorOptions) {
    this.input = input
    this.options = options
  }

  async *pages(client: PaginatorClient, options?: OperationOptions): AsyncGenerator<ListPartsResult> {
    const req = shallowClone(this.input)
    if (this.options?.limit !== undefined) req.maxParts = this.options.limit
    for (;;) {
      const result = await client.send(new ListParts(req), options)
      yield result
      if (result.isTruncated !== true) return
      req.partNumberMarker = result.nextPartNumberMarker
    }
  }
}
