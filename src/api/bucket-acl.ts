import type { Command, OperationInput, OperationOutput } from '../types.js'
import {
  deserializeGetBucketAcl,
  deserializePutBucketAcl,
  serializeGetBucketAcl,
  serializePutBucketAcl,
} from '../transform/bucket-acl.js'
import type {
  GetBucketAclRequest,
  GetBucketAclResult,
  PutBucketAclRequest,
  PutBucketAclResult,
} from '../models/bucket-acl.js'

/** Sets a bucket's ACL. Valid values: private, public-read, public-read-write. */
export class PutBucketAcl implements Command<PutBucketAclRequest, PutBucketAclResult> {
  readonly opName = 'PutBucketAcl'
  readonly input: PutBucketAclRequest

  constructor(input: PutBucketAclRequest) {
    this.input = input
  }

  serialize(input: PutBucketAclRequest): Promise<OperationInput> {
    return Promise.resolve(serializePutBucketAcl(input))
  }

  deserialize(output: OperationOutput): Promise<PutBucketAclResult> {
    return deserializePutBucketAcl(output)
  }
}

/** Reads a bucket's ACL and owner. */
export class GetBucketAcl implements Command<GetBucketAclRequest, GetBucketAclResult> {
  readonly opName = 'GetBucketAcl'
  readonly input: GetBucketAclRequest

  constructor(input: GetBucketAclRequest) {
    this.input = input
  }

  serialize(input: GetBucketAclRequest): Promise<OperationInput> {
    return Promise.resolve(serializeGetBucketAcl(input))
  }

  deserialize(output: OperationOutput): Promise<GetBucketAclResult> {
    return deserializeGetBucketAcl(output)
  }
}
