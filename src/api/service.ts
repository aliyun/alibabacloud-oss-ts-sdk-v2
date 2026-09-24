import type { Command, OperationInput, OperationOutput } from '../types.js'
import {
  deserializeDescribeRegions,
  deserializeListBuckets,
  serializeDescribeRegions,
  serializeListBuckets,
} from '../transform/service.js'
import type {
  DescribeRegionsRequest,
  DescribeRegionsResult,
  ListBucketsRequest,
  ListBucketsResult,
} from '../models/service.js'

/**
 * Lists the buckets owned by the requester, one page at a time. When the result is truncated, pass
 * its `nextMarker` to the next call as `marker`.
 */
export class ListBuckets implements Command<ListBucketsRequest, ListBucketsResult> {
  readonly opName = 'ListBuckets'
  readonly input: ListBucketsRequest

  constructor(input: ListBucketsRequest = {}) {
    this.input = input
  }

  serialize(input: ListBucketsRequest): Promise<OperationInput> {
    return Promise.resolve(serializeListBuckets(input))
  }

  deserialize(output: OperationOutput): Promise<ListBucketsResult> {
    return deserializeListBuckets(output)
  }
}

/** Describes the OSS regions and their endpoints. Left unset, `regions` returns every region. */
export class DescribeRegions implements Command<DescribeRegionsRequest, DescribeRegionsResult> {
  readonly opName = 'DescribeRegions'
  readonly input: DescribeRegionsRequest

  constructor(input: DescribeRegionsRequest = {}) {
    this.input = input
  }

  serialize(input: DescribeRegionsRequest): Promise<OperationInput> {
    return Promise.resolve(serializeDescribeRegions(input))
  }

  deserialize(output: OperationOutput): Promise<DescribeRegionsResult> {
    return deserializeDescribeRegions(output)
  }
}
