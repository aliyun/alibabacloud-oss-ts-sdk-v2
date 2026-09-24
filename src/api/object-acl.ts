import type { Command, OperationInput, OperationOutput } from '../types.js'
import {
  deserializeGetObjectAcl,
  deserializePutObjectAcl,
  serializeGetObjectAcl,
  serializePutObjectAcl,
} from '../transform/object-acl.js'
import type {
  GetObjectAclRequest,
  GetObjectAclResult,
  PutObjectAclRequest,
  PutObjectAclResult,
} from '../models/object-acl.js'

/** Sets the ACL of an object. */
export class PutObjectAcl implements Command<PutObjectAclRequest, PutObjectAclResult> {
  readonly opName = 'PutObjectAcl'
  readonly input: PutObjectAclRequest

  constructor(input: PutObjectAclRequest) {
    this.input = input
  }

  serialize(input: PutObjectAclRequest): Promise<OperationInput> {
    return Promise.resolve(serializePutObjectAcl(input))
  }

  deserialize(output: OperationOutput): Promise<PutObjectAclResult> {
    return deserializePutObjectAcl(output)
  }
}

/** Reads the ACL of an object. */
export class GetObjectAcl implements Command<GetObjectAclRequest, GetObjectAclResult> {
  readonly opName = 'GetObjectAcl'
  readonly input: GetObjectAclRequest

  constructor(input: GetObjectAclRequest) {
    this.input = input
  }

  serialize(input: GetObjectAclRequest): Promise<OperationInput> {
    return Promise.resolve(serializeGetObjectAcl(input))
  }

  deserialize(output: OperationOutput): Promise<GetObjectAclResult> {
    return deserializeGetObjectAcl(output)
  }
}
