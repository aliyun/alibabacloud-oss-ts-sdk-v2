import { Client, PutObject, StaticCredentialsProvider } from '../../src/index.js'
import { createBrowserTransport } from '../../src/runtime/browser/http.js'

export async function upload(bucket: string, key: string, bytes: Uint8Array): Promise<string> {
  const client = new Client({
    region: 'cn-hangzhou',
    transport: createBrowserTransport(),
    credentialsProvider: new StaticCredentialsProvider('id', 'secret'),
  })

  const result = await client.send(new PutObject({ bucket, key, body: bytes }))
  return result.etag ?? ''
}
