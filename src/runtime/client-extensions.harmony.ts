import { GetObject, PutObject } from '../api/object-basic.js'
import type {
  GetObjectRequest,
  GetObjectResult,
  PutObjectRequest,
  PutObjectResult,
} from '../models/object-basic.js'
import type { Command, OperationOptions } from '../types.js'
import { shallowClone } from '../utils/record.js'
import { fileBody } from './harmony/file-content.js'
import { FileSinkFactory } from './harmony/file-sink.js'

interface ClientApi {
  send<I, O>(command: Command<I, O>, options?: OperationOptions): Promise<O>
}

/** Uploads a local file. The path is opened by `fileBody`; this function does not read it into one buffer. */
export async function putObjectFromFile(
  client: ClientApi,
  request: PutObjectRequest,
  path: string,
  options?: OperationOptions,
): Promise<PutObjectResult> {
  const next = shallowClone(request)
  next.body = await fileBody(path)
  return await client.send(new PutObject(next), options)
}

/**
 * Downloads an object through an OpenHarmony Client into the file at `path`. The body goes to the file as it
 * arrives, so no platform size limit applies and `result.body` comes back empty. A download that fails for
 * good leaves the file as far as the last attempt got; resume it by setting `sinkFactory` to a
 * `FileSinkFactory` at that offset and asking the service for the range from there.
 */
export async function getObjectToFile(
  client: ClientApi,
  request: GetObjectRequest,
  path: string,
  options?: OperationOptions,
): Promise<GetObjectResult> {
  const input: GetObjectRequest = shallowClone(request)
  input.sinkFactory = new FileSinkFactory(path)
  const result = await client.send(new GetObject(input), options)
  result.body = undefined
  return result
}
