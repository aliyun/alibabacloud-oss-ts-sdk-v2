import type { Command, OperationInput, OperationOutput } from '../types.js'
import {
  deserializeGetBucketVersioning,
  deserializeListObjectVersions,
  deserializePutBucketVersioning,
  serializeGetBucketVersioning,
  serializeListObjectVersions,
  serializePutBucketVersioning,
} from '../transform/bucket-versioning.js'
import type {
  GetBucketVersioningRequest,
  GetBucketVersioningResult,
  ListObjectVersionsRequest,
  ListObjectVersionsResult,
  PutBucketVersioningRequest,
  PutBucketVersioningResult,
} from '../models/bucket-versioning.js'

/** Sets the versioning state of a bucket. Valid states: Enabled, Suspended. */
export class PutBucketVersioning implements Command<PutBucketVersioningRequest, PutBucketVersioningResult> {
  readonly opName = 'PutBucketVersioning'
  readonly input: PutBucketVersioningRequest

  constructor(input: PutBucketVersioningRequest) {
    this.input = input
  }

  serialize(input: PutBucketVersioningRequest): Promise<OperationInput> {
    return Promise.resolve(serializePutBucketVersioning(input))
  }

  deserialize(output: OperationOutput): Promise<PutBucketVersioningResult> {
    return deserializePutBucketVersioning(output)
  }
}

/** Reads the versioning state of a bucket. */
export class GetBucketVersioning implements Command<GetBucketVersioningRequest, GetBucketVersioningResult> {
  readonly opName = 'GetBucketVersioning'
  readonly input: GetBucketVersioningRequest

  constructor(input: GetBucketVersioningRequest) {
    this.input = input
  }

  serialize(input: GetBucketVersioningRequest): Promise<OperationInput> {
    return Promise.resolve(serializeGetBucketVersioning(input))
  }

  deserialize(output: OperationOutput): Promise<GetBucketVersioningResult> {
    return deserializeGetBucketVersioning(output)
  }
}

/** Lists the versions of the objects in a bucket, including delete markers. */
export class ListObjectVersions implements Command<ListObjectVersionsRequest, ListObjectVersionsResult> {
  readonly opName = 'ListObjectVersions'
  readonly input: ListObjectVersionsRequest

  constructor(input: ListObjectVersionsRequest) {
    this.input = input
  }

  serialize(input: ListObjectVersionsRequest): Promise<OperationInput> {
    return Promise.resolve(serializeListObjectVersions(input))
  }

  deserialize(output: OperationOutput): Promise<ListObjectVersionsResult> {
    return deserializeListObjectVersions(output)
  }
}
