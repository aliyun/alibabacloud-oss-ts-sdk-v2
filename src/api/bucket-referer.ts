import type { Command, OperationInput, OperationOutput } from '../types.js'
import {
  deserializeGetBucketReferer,
  deserializePutBucketReferer,
  serializeGetBucketReferer,
  serializePutBucketReferer,
} from '../transform/bucket-referer.js'
import type {
  GetBucketRefererRequest,
  GetBucketRefererResult,
  PutBucketRefererRequest,
  PutBucketRefererResult,
} from '../models/bucket-referer.js'

/** Sets the hotlink protection (Referer) configuration of a bucket. */
export class PutBucketReferer implements Command<PutBucketRefererRequest, PutBucketRefererResult> {
  readonly opName = 'PutBucketReferer'
  readonly input: PutBucketRefererRequest

  constructor(input: PutBucketRefererRequest) {
    this.input = input
  }

  serialize(input: PutBucketRefererRequest): Promise<OperationInput> {
    return Promise.resolve(serializePutBucketReferer(input))
  }

  deserialize(output: OperationOutput): Promise<PutBucketRefererResult> {
    return deserializePutBucketReferer(output)
  }
}

/** Reads the hotlink protection (Referer) configuration of a bucket. */
export class GetBucketReferer implements Command<GetBucketRefererRequest, GetBucketRefererResult> {
  readonly opName = 'GetBucketReferer'
  readonly input: GetBucketRefererRequest

  constructor(input: GetBucketRefererRequest) {
    this.input = input
  }

  serialize(input: GetBucketRefererRequest): Promise<OperationInput> {
    return Promise.resolve(serializeGetBucketReferer(input))
  }

  deserialize(output: OperationOutput): Promise<GetBucketRefererResult> {
    return deserializeGetBucketReferer(output)
  }
}
