import type { Command, OperationInput, OperationOutput, Presignable } from '../types.js'
import {
  deserializeAppendObject,
  deserializeCleanRestoredObject,
  deserializeCopyObject,
  deserializeDeleteMultipleObjects,
  deserializeDeleteObject,
  deserializeGetObject,
  deserializeGetObjectMeta,
  deserializeHeadObject,
  deserializePutObject,
  deserializeRestoreObject,
  serializeAppendObject,
  serializeCleanRestoredObject,
  serializeCopyObject,
  serializeDeleteMultipleObjects,
  serializeDeleteObject,
  serializeGetObject,
  serializeGetObjectMeta,
  serializeHeadObject,
  serializePutObject,
  serializePutObjectPresign,
  serializeRestoreObject,
} from '../transform/object-basic.js'
import type {
  AppendObjectRequest,
  AppendObjectResult,
  CleanRestoredObjectRequest,
  CleanRestoredObjectResult,
  CopyObjectRequest,
  CopyObjectResult,
  DeleteMultipleObjectsRequest,
  DeleteMultipleObjectsResult,
  DeleteObjectRequest,
  DeleteObjectResult,
  GetObjectMetaRequest,
  GetObjectMetaResult,
  GetObjectRequest,
  GetObjectResult,
  HeadObjectRequest,
  HeadObjectResult,
  PutObjectRequest,
  PutObjectResult,
  RestoreObjectRequest,
  RestoreObjectResult,
} from '../models/object-basic.js'

/** Uploads an object. */
export class PutObject implements Presignable<PutObjectRequest, PutObjectResult> {
  readonly opName = 'PutObject'
  readonly input: PutObjectRequest

  constructor(input: PutObjectRequest) {
    this.input = input
  }

  serialize(input: PutObjectRequest): Promise<OperationInput> {
    return Promise.resolve(serializePutObject(input))
  }

  serializePresign(input: PutObjectRequest): Promise<OperationInput> {
    return Promise.resolve(serializePutObjectPresign(input))
  }

  deserialize(output: OperationOutput): Promise<PutObjectResult> {
    return deserializePutObject(output)
  }
}

/** Downloads an object. */
export class GetObject implements Presignable<GetObjectRequest, GetObjectResult> {
  readonly opName = 'GetObject'
  readonly input: GetObjectRequest

  constructor(input: GetObjectRequest) {
    this.input = input
  }

  serialize(input: GetObjectRequest): Promise<OperationInput> {
    return Promise.resolve(serializeGetObject(input))
  }

  /** The SDK adds nothing of its own to a download, so the presigned request is the same one. */
  serializePresign(input: GetObjectRequest): Promise<OperationInput> {
    return Promise.resolve(serializeGetObject(input))
  }

  deserialize(output: OperationOutput): Promise<GetObjectResult> {
    return Promise.resolve(deserializeGetObject(output))
  }
}

/** Queries the metadata of an object, without returning its content. */
export class HeadObject implements Presignable<HeadObjectRequest, HeadObjectResult> {
  readonly opName = 'HeadObject'
  readonly input: HeadObjectRequest

  constructor(input: HeadObjectRequest) {
    this.input = input
  }

  serialize(input: HeadObjectRequest): Promise<OperationInput> {
    return Promise.resolve(serializeHeadObject(input))
  }

  /** The SDK adds nothing of its own to a head, so the presigned request is the same one. */
  serializePresign(input: HeadObjectRequest): Promise<OperationInput> {
    return Promise.resolve(serializeHeadObject(input))
  }

  deserialize(output: OperationOutput): Promise<HeadObjectResult> {
    return deserializeHeadObject(output)
  }
}

/**
 * Deletes an object. Deleting a key that does not exist is a success, not a `NoSuchKey`: OSS
 * answers 204 whether or not the key was there.
 */
export class DeleteObject implements Command<DeleteObjectRequest, DeleteObjectResult> {
  readonly opName = 'DeleteObject'
  readonly input: DeleteObjectRequest

  constructor(input: DeleteObjectRequest) {
    this.input = input
  }

  serialize(input: DeleteObjectRequest): Promise<OperationInput> {
    return Promise.resolve(serializeDeleteObject(input))
  }

  deserialize(output: OperationOutput): Promise<DeleteObjectResult> {
    return deserializeDeleteObject(output)
  }
}

/** Copies an object within OSS, without downloading and re-uploading it. */
export class CopyObject implements Command<CopyObjectRequest, CopyObjectResult> {
  readonly opName = 'CopyObject'
  readonly input: CopyObjectRequest

  constructor(input: CopyObjectRequest) {
    this.input = input
  }

  serialize(input: CopyObjectRequest): Promise<OperationInput> {
    return Promise.resolve(serializeCopyObject(input))
  }

  deserialize(output: OperationOutput): Promise<CopyObjectResult> {
    return deserializeCopyObject(output)
  }
}

/** Appends data to the end of an appendable object, creating it on the first append at position 0. */
export class AppendObject implements Command<AppendObjectRequest, AppendObjectResult> {
  readonly opName = 'AppendObject'
  readonly input: AppendObjectRequest

  constructor(input: AppendObjectRequest) {
    this.input = input
  }

  serialize(input: AppendObjectRequest): Promise<OperationInput> {
    return Promise.resolve(serializeAppendObject(input))
  }

  deserialize(output: OperationOutput): Promise<AppendObjectResult> {
    return deserializeAppendObject(output)
  }
}

/** Deletes multiple objects in one request. */
export class DeleteMultipleObjects implements Command<DeleteMultipleObjectsRequest, DeleteMultipleObjectsResult> {
  readonly opName = 'DeleteMultipleObjects'
  readonly input: DeleteMultipleObjectsRequest

  constructor(input: DeleteMultipleObjectsRequest) {
    this.input = input
  }

  serialize(input: DeleteMultipleObjectsRequest): Promise<OperationInput> {
    return Promise.resolve(serializeDeleteMultipleObjects(input))
  }

  deserialize(output: OperationOutput): Promise<DeleteMultipleObjectsResult> {
    return deserializeDeleteMultipleObjects(output)
  }
}

/** Queries a small fixed set of object metadata, without the stored user metadata a HEAD returns. */
export class GetObjectMeta implements Command<GetObjectMetaRequest, GetObjectMetaResult> {
  readonly opName = 'GetObjectMeta'
  readonly input: GetObjectMetaRequest

  constructor(input: GetObjectMetaRequest) {
    this.input = input
  }

  serialize(input: GetObjectMetaRequest): Promise<OperationInput> {
    return Promise.resolve(serializeGetObjectMeta(input))
  }

  deserialize(output: OperationOutput): Promise<GetObjectMetaResult> {
    return deserializeGetObjectMeta(output)
  }
}

/** Restores an Archive or Cold Archive object into a readable state. */
export class RestoreObject implements Command<RestoreObjectRequest, RestoreObjectResult> {
  readonly opName = 'RestoreObject'
  readonly input: RestoreObjectRequest

  constructor(input: RestoreObjectRequest) {
    this.input = input
  }

  serialize(input: RestoreObjectRequest): Promise<OperationInput> {
    return Promise.resolve(serializeRestoreObject(input))
  }

  deserialize(output: OperationOutput): Promise<RestoreObjectResult> {
    return deserializeRestoreObject(output)
  }
}

/** Discards the readable copy created by RestoreObject ahead of its expiry. */
export class CleanRestoredObject implements Command<CleanRestoredObjectRequest, CleanRestoredObjectResult> {
  readonly opName = 'CleanRestoredObject'
  readonly input: CleanRestoredObjectRequest

  constructor(input: CleanRestoredObjectRequest) {
    this.input = input
  }

  serialize(input: CleanRestoredObjectRequest): Promise<OperationInput> {
    return Promise.resolve(serializeCleanRestoredObject(input))
  }

  deserialize(output: OperationOutput): Promise<CleanRestoredObjectResult> {
    return deserializeCleanRestoredObject(output)
  }
}
