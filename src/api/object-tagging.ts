import type { Command, OperationInput, OperationOutput } from '../types.js'
import {
  deserializeDeleteObjectTagging,
  deserializeGetObjectTagging,
  deserializePutObjectTagging,
  serializeDeleteObjectTagging,
  serializeGetObjectTagging,
  serializePutObjectTagging,
} from '../transform/object-tagging.js'
import type {
  DeleteObjectTaggingRequest,
  DeleteObjectTaggingResult,
  GetObjectTaggingRequest,
  GetObjectTaggingResult,
  PutObjectTaggingRequest,
  PutObjectTaggingResult,
} from '../models/object-tagging.js'

/** Attaches or replaces the tags of an object. */
export class PutObjectTagging implements Command<PutObjectTaggingRequest, PutObjectTaggingResult> {
  readonly opName = 'PutObjectTagging'
  readonly input: PutObjectTaggingRequest

  constructor(input: PutObjectTaggingRequest) {
    this.input = input
  }

  serialize(input: PutObjectTaggingRequest): Promise<OperationInput> {
    return Promise.resolve(serializePutObjectTagging(input))
  }

  deserialize(output: OperationOutput): Promise<PutObjectTaggingResult> {
    return deserializePutObjectTagging(output)
  }
}

/** Reads the tags of an object. */
export class GetObjectTagging implements Command<GetObjectTaggingRequest, GetObjectTaggingResult> {
  readonly opName = 'GetObjectTagging'
  readonly input: GetObjectTaggingRequest

  constructor(input: GetObjectTaggingRequest) {
    this.input = input
  }

  serialize(input: GetObjectTaggingRequest): Promise<OperationInput> {
    return Promise.resolve(serializeGetObjectTagging(input))
  }

  deserialize(output: OperationOutput): Promise<GetObjectTaggingResult> {
    return deserializeGetObjectTagging(output)
  }
}

/** Removes all tags from an object. */
export class DeleteObjectTagging implements Command<DeleteObjectTaggingRequest, DeleteObjectTaggingResult> {
  readonly opName = 'DeleteObjectTagging'
  readonly input: DeleteObjectTaggingRequest

  constructor(input: DeleteObjectTaggingRequest) {
    this.input = input
  }

  serialize(input: DeleteObjectTaggingRequest): Promise<OperationInput> {
    return Promise.resolve(serializeDeleteObjectTagging(input))
  }

  deserialize(output: OperationOutput): Promise<DeleteObjectTaggingResult> {
    return deserializeDeleteObjectTagging(output)
  }
}
