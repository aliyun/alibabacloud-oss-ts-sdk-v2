import { NotSupportedError } from '../error/types.js'
import type {
  GetObjectRequest,
  GetObjectResult,
  PutObjectRequest,
  PutObjectResult,
} from '../models/object-basic.js'
import type { Command, OperationOptions } from '../types.js'

interface ClientApi {
  send<I, O>(command: Command<I, O>, options?: OperationOptions): Promise<O>
}

export function putObjectFromFile(
  _client: ClientApi,
  _request: PutObjectRequest,
  _path: string,
  _options?: OperationOptions,
): Promise<PutObjectResult> {
  return Promise.reject(new NotSupportedError('putObjectFromFile'))
}

export function getObjectToFile(
  _client: ClientApi,
  _request: GetObjectRequest,
  _path: string,
  _options?: OperationOptions,
): Promise<GetObjectResult> {
  return Promise.reject(new NotSupportedError('getObjectToFile'))
}
