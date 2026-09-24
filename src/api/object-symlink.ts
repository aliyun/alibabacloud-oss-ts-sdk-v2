import type { Command, OperationInput, OperationOutput } from '../types.js'
import {
  deserializeGetSymlink,
  deserializePutSymlink,
  serializeGetSymlink,
  serializePutSymlink,
} from '../transform/object-symlink.js'
import type {
  GetSymlinkRequest,
  GetSymlinkResult,
  PutSymlinkRequest,
  PutSymlinkResult,
} from '../models/object-symlink.js'

/** Creates a symbolic link that points to a target object. */
export class PutSymlink implements Command<PutSymlinkRequest, PutSymlinkResult> {
  readonly opName = 'PutSymlink'
  readonly input: PutSymlinkRequest

  constructor(input: PutSymlinkRequest) {
    this.input = input
  }

  serialize(input: PutSymlinkRequest): Promise<OperationInput> {
    return Promise.resolve(serializePutSymlink(input))
  }

  deserialize(output: OperationOutput): Promise<PutSymlinkResult> {
    return deserializePutSymlink(output)
  }
}

/** Reads a symbolic link and the target it points to. */
export class GetSymlink implements Command<GetSymlinkRequest, GetSymlinkResult> {
  readonly opName = 'GetSymlink'
  readonly input: GetSymlinkRequest

  constructor(input: GetSymlinkRequest) {
    this.input = input
  }

  serialize(input: GetSymlinkRequest): Promise<OperationInput> {
    return Promise.resolve(serializeGetSymlink(input))
  }

  deserialize(output: OperationOutput): Promise<GetSymlinkResult> {
    return deserializeGetSymlink(output)
  }
}
