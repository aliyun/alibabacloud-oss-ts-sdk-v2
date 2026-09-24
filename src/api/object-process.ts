import type { Command, OperationInput, OperationOutput } from '../types.js'
import {
  deserializeAsyncProcessObject,
  deserializeProcessObject,
  serializeAsyncProcessObject,
  serializeProcessObject,
} from '../transform/object-process.js'
import type {
  AsyncProcessObjectRequest,
  AsyncProcessObjectResult,
  ProcessObjectRequest,
  ProcessObjectResult,
} from '../models/object-process.js'

/** Processes an object and stores the result as a new object. */
export class ProcessObject implements Command<ProcessObjectRequest, ProcessObjectResult> {
  readonly opName = 'ProcessObject'
  readonly input: ProcessObjectRequest

  constructor(input: ProcessObjectRequest) {
    this.input = input
  }

  serialize(input: ProcessObjectRequest): Promise<OperationInput> {
    return Promise.resolve(serializeProcessObject(input))
  }

  deserialize(output: OperationOutput): Promise<ProcessObjectResult> {
    return deserializeProcessObject(output)
  }
}

/** Submits an asynchronous media or image processing task. */
export class AsyncProcessObject implements Command<AsyncProcessObjectRequest, AsyncProcessObjectResult> {
  readonly opName = 'AsyncProcessObject'
  readonly input: AsyncProcessObjectRequest

  constructor(input: AsyncProcessObjectRequest) {
    this.input = input
  }

  serialize(input: AsyncProcessObjectRequest): Promise<OperationInput> {
    return Promise.resolve(serializeAsyncProcessObject(input))
  }

  deserialize(output: OperationOutput): Promise<AsyncProcessObjectResult> {
    return deserializeAsyncProcessObject(output)
  }
}
