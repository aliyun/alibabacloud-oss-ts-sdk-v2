import type { Command, OperationInput, OperationOutput } from '../types.js'
import {
  deserializeAbortMultipartUpload,
  deserializeCompleteMultipartUpload,
  deserializeInitiateMultipartUpload,
  deserializeListMultipartUploads,
  deserializeListParts,
  deserializeUploadPart,
  deserializeUploadPartCopy,
  serializeAbortMultipartUpload,
  serializeCompleteMultipartUpload,
  serializeInitiateMultipartUpload,
  serializeListMultipartUploads,
  serializeListParts,
  serializeUploadPart,
  serializeUploadPartCopy,
} from '../transform/object-multipart.js'
import type {
  AbortMultipartUploadRequest,
  AbortMultipartUploadResult,
  CompleteMultipartUploadRequest,
  CompleteMultipartUploadResult,
  InitiateMultipartUploadRequest,
  InitiateMultipartUploadResult,
  ListMultipartUploadsRequest,
  ListMultipartUploadsResult,
  ListPartsRequest,
  ListPartsResult,
  UploadPartCopyRequest,
  UploadPartCopyResult,
  UploadPartRequest,
  UploadPartResult,
} from '../models/object-multipart.js'

/** Starts a multipart upload and returns the upload ID that the later parts reference. */
export class InitiateMultipartUpload
  implements Command<InitiateMultipartUploadRequest, InitiateMultipartUploadResult>
{
  readonly opName = 'InitiateMultipartUpload'
  readonly input: InitiateMultipartUploadRequest

  constructor(input: InitiateMultipartUploadRequest) {
    this.input = input
  }

  serialize(input: InitiateMultipartUploadRequest): Promise<OperationInput> {
    return Promise.resolve(serializeInitiateMultipartUpload(input))
  }

  deserialize(output: OperationOutput): Promise<InitiateMultipartUploadResult> {
    return deserializeInitiateMultipartUpload(output)
  }
}

/** Uploads one part of a multipart upload. */
export class UploadPart implements Command<UploadPartRequest, UploadPartResult> {
  readonly opName = 'UploadPart'
  readonly input: UploadPartRequest

  constructor(input: UploadPartRequest) {
    this.input = input
  }

  serialize(input: UploadPartRequest): Promise<OperationInput> {
    return Promise.resolve(serializeUploadPart(input))
  }

  deserialize(output: OperationOutput): Promise<UploadPartResult> {
    return deserializeUploadPart(output)
  }
}

/** Assembles the uploaded parts into the final object. */
export class CompleteMultipartUpload
  implements Command<CompleteMultipartUploadRequest, CompleteMultipartUploadResult>
{
  readonly opName = 'CompleteMultipartUpload'
  readonly input: CompleteMultipartUploadRequest

  constructor(input: CompleteMultipartUploadRequest) {
    this.input = input
  }

  serialize(input: CompleteMultipartUploadRequest): Promise<OperationInput> {
    return Promise.resolve(serializeCompleteMultipartUpload(input))
  }

  deserialize(output: OperationOutput): Promise<CompleteMultipartUploadResult> {
    return deserializeCompleteMultipartUpload(output, this.input.callback !== undefined)
  }
}

/** Uploads one part by copying a range from an existing object. */
export class UploadPartCopy implements Command<UploadPartCopyRequest, UploadPartCopyResult> {
  readonly opName = 'UploadPartCopy'
  readonly input: UploadPartCopyRequest

  constructor(input: UploadPartCopyRequest) {
    this.input = input
  }

  serialize(input: UploadPartCopyRequest): Promise<OperationInput> {
    return Promise.resolve(serializeUploadPartCopy(input))
  }

  deserialize(output: OperationOutput): Promise<UploadPartCopyResult> {
    return deserializeUploadPartCopy(output)
  }
}

/** Cancels a multipart upload and frees the parts already stored. */
export class AbortMultipartUpload implements Command<AbortMultipartUploadRequest, AbortMultipartUploadResult> {
  readonly opName = 'AbortMultipartUpload'
  readonly input: AbortMultipartUploadRequest

  constructor(input: AbortMultipartUploadRequest) {
    this.input = input
  }

  serialize(input: AbortMultipartUploadRequest): Promise<OperationInput> {
    return Promise.resolve(serializeAbortMultipartUpload(input))
  }

  deserialize(output: OperationOutput): Promise<AbortMultipartUploadResult> {
    return deserializeAbortMultipartUpload(output)
  }
}

/** Lists the multipart uploads that have been started but not completed or aborted. */
export class ListMultipartUploads
  implements Command<ListMultipartUploadsRequest, ListMultipartUploadsResult>
{
  readonly opName = 'ListMultipartUploads'
  readonly input: ListMultipartUploadsRequest

  constructor(input: ListMultipartUploadsRequest) {
    this.input = input
  }

  serialize(input: ListMultipartUploadsRequest): Promise<OperationInput> {
    return Promise.resolve(serializeListMultipartUploads(input))
  }

  deserialize(output: OperationOutput): Promise<ListMultipartUploadsResult> {
    return deserializeListMultipartUploads(output)
  }
}

/** Lists the parts already uploaded for a multipart upload. */
export class ListParts implements Command<ListPartsRequest, ListPartsResult> {
  readonly opName = 'ListParts'
  readonly input: ListPartsRequest

  constructor(input: ListPartsRequest) {
    this.input = input
  }

  serialize(input: ListPartsRequest): Promise<OperationInput> {
    return Promise.resolve(serializeListParts(input))
  }

  deserialize(output: OperationOutput): Promise<ListPartsResult> {
    return deserializeListParts(output)
  }
}
