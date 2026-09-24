import type { Command, OperationInput, OperationOutput } from '../types.js'
import {
  deserializeDeleteBucket,
  deserializeGetBucketInfo,
  deserializeGetBucketLocation,
  deserializeGetBucketStat,
  deserializeListObjects,
  deserializeListObjectsV2,
  deserializePutBucket,
  serializeDeleteBucket,
  serializeGetBucketInfo,
  serializeGetBucketLocation,
  serializeGetBucketStat,
  serializeListObjects,
  serializeListObjectsV2,
  serializePutBucket,
} from '../transform/bucket-basic.js'
import type {
  DeleteBucketRequest,
  DeleteBucketResult,
  GetBucketInfoRequest,
  GetBucketInfoResult,
  GetBucketLocationRequest,
  GetBucketLocationResult,
  GetBucketStatRequest,
  GetBucketStatResult,
  ListObjectsRequest,
  ListObjectsResult,
  ListObjectsV2Request,
  ListObjectsV2Result,
  PutBucketRequest,
  PutBucketResult,
} from '../models/bucket-basic.js'

/**
 * Lists the objects in a bucket, one page at a time. When the result is truncated, pass its
 * `nextContinuationToken` to the next call.
 */
export class ListObjectsV2 implements Command<ListObjectsV2Request, ListObjectsV2Result> {
  readonly opName = 'ListObjectsV2'
  readonly input: ListObjectsV2Request

  constructor(input: ListObjectsV2Request) {
    this.input = input
  }

  serialize(input: ListObjectsV2Request): Promise<OperationInput> {
    return Promise.resolve(serializeListObjectsV2(input))
  }

  deserialize(output: OperationOutput): Promise<ListObjectsV2Result> {
    return deserializeListObjectsV2(output)
  }
}

/**
 * Lists the objects in a bucket, one page at a time, in the original (V1) style. When the result is
 * truncated, pass its `nextMarker` to the next call. Prefer `ListObjectsV2` for new code.
 */
export class ListObjects implements Command<ListObjectsRequest, ListObjectsResult> {
  readonly opName = 'ListObjects'
  readonly input: ListObjectsRequest

  constructor(input: ListObjectsRequest) {
    this.input = input
  }

  serialize(input: ListObjectsRequest): Promise<OperationInput> {
    return Promise.resolve(serializeListObjects(input))
  }

  deserialize(output: OperationOutput): Promise<ListObjectsResult> {
    return deserializeListObjects(output)
  }
}

/** Reads a bucket's configuration: region, endpoints, owner, ACL, encryption, versioning. */
export class GetBucketInfo implements Command<GetBucketInfoRequest, GetBucketInfoResult> {
  readonly opName = 'GetBucketInfo'
  readonly input: GetBucketInfoRequest

  constructor(input: GetBucketInfoRequest) {
    this.input = input
  }

  serialize(input: GetBucketInfoRequest): Promise<OperationInput> {
    return Promise.resolve(serializeGetBucketInfo(input))
  }

  deserialize(output: OperationOutput): Promise<GetBucketInfoResult> {
    return deserializeGetBucketInfo(output)
  }
}

/** Reads the region a bucket lives in, e.g. `oss-cn-hangzhou`. */
export class GetBucketLocation implements Command<GetBucketLocationRequest, GetBucketLocationResult> {
  readonly opName = 'GetBucketLocation'
  readonly input: GetBucketLocationRequest

  constructor(input: GetBucketLocationRequest) {
    this.input = input
  }

  serialize(input: GetBucketLocationRequest): Promise<OperationInput> {
    return Promise.resolve(serializeGetBucketLocation(input))
  }

  deserialize(output: OperationOutput): Promise<GetBucketLocationResult> {
    return deserializeGetBucketLocation(output)
  }
}

/** Reads a bucket's storage usage and object counts, broken down by storage class. */
export class GetBucketStat implements Command<GetBucketStatRequest, GetBucketStatResult> {
  readonly opName = 'GetBucketStat'
  readonly input: GetBucketStatRequest

  constructor(input: GetBucketStatRequest) {
    this.input = input
  }

  serialize(input: GetBucketStatRequest): Promise<OperationInput> {
    return Promise.resolve(serializeGetBucketStat(input))
  }

  deserialize(output: OperationOutput): Promise<GetBucketStatResult> {
    return deserializeGetBucketStat(output)
  }
}

/** Creates a bucket. Left unconfigured, OSS creates it `Standard` and `private`, unversioned. */
export class PutBucket implements Command<PutBucketRequest, PutBucketResult> {
  readonly opName = 'PutBucket'
  readonly input: PutBucketRequest

  constructor(input: PutBucketRequest) {
    this.input = input
  }

  serialize(input: PutBucketRequest): Promise<OperationInput> {
    return Promise.resolve(serializePutBucket(input))
  }

  deserialize(output: OperationOutput): Promise<PutBucketResult> {
    return deserializePutBucket(output)
  }
}

/**
 * Deletes a bucket that is already empty. Emptying it is the caller's job: a bucket still holding an
 * object, a version or an unfinished multipart upload comes back 409 `BucketNotEmpty`.
 */
export class DeleteBucket implements Command<DeleteBucketRequest, DeleteBucketResult> {
  readonly opName = 'DeleteBucket'
  readonly input: DeleteBucketRequest

  constructor(input: DeleteBucketRequest) {
    this.input = input
  }

  serialize(input: DeleteBucketRequest): Promise<OperationInput> {
    return Promise.resolve(serializeDeleteBucket(input))
  }

  deserialize(output: OperationOutput): Promise<DeleteBucketResult> {
    return deserializeDeleteBucket(output)
  }
}
