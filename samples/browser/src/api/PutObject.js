// Demonstrates: Upload a string as an object.
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.js'

export async function run(log, key = 'sample/hello.txt') {
  try {
    const result = await createClient().send(
      new oss.PutObject({ bucket: bucket(), key, body: 'hello from the OSS TypeScript SDK', contentType: 'text/plain' }),
    )
    log('uploaded ' + key)
    log('  etag:      ' + result.etag)
    log('  requestId: ' + result.requestId)
  } catch (error) {
    report(error, log)
  }
}
