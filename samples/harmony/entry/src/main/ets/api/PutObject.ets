// Demonstrates: Upload a string as an object.
import { PutObject } from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig'

export async function run(key: string = 'sample/hello.txt'): Promise<void> {
  try {
    const result = await createClient().send(
      new PutObject({ bucket: bucket(), key: key, body: 'hello from the OSS TypeScript SDK', contentType: 'text/plain' }),
    )
    console.log('uploaded ' + key)
    console.log('  etag:      ' + result.etag)
    console.log('  requestId: ' + result.requestId)
  } catch (error) {
    report(error)
  }
}
