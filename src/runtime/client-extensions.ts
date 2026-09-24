import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { finished } from 'node:stream/promises'
import { GetObject, PutObject } from '../api/object-basic.js'
import type {
  GetObjectRequest,
  GetObjectResult,
  PutObjectRequest,
  PutObjectResult,
} from '../models/object-basic.js'
import type { Command, OperationOptions } from '../types.js'
import type { StreamLike } from '../transport/types.js'
import { fileBody } from './node/file-content.js'

interface ClientApi {
  send<I, O>(command: Command<I, O>, options?: OperationOptions): Promise<O>
}

async function writeToFile(stream: StreamLike, path: string): Promise<void> {
  const output = createWriteStream(path)
  try {
    for (;;) {
      const chunk = await stream.read()
      if (chunk === null) break
      if (!output.write(chunk)) await once(output, 'drain')
    }
    output.end()
    await finished(output)
  } catch (err) {
    output.destroy()
    await stream.cancel?.()
    throw err
  }
}

/** Uploads a local file through a Node Client. */
export async function putObjectFromFile(
  client: ClientApi,
  request: PutObjectRequest,
  path: string,
  options?: OperationOptions,
): Promise<PutObjectResult> {
  return await client.send(new PutObject({ ...request, body: await fileBody(path) }), options)
}

/** Downloads an object through a Node Client into a local file. */
export async function getObjectToFile(
  client: ClientApi,
  request: GetObjectRequest,
  path: string,
  options?: OperationOptions,
): Promise<GetObjectResult> {
  const result = await client.send(new GetObject(request), options)
  if (result.body !== undefined) await writeToFile(result.body.stream(), path)
  result.body = undefined
  return result
}
