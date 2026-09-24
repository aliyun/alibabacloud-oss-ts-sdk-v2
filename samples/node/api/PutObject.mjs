// Demonstrates: Upload a string as an object.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/hello.txt'

try {
  const result = await createClient().send(
    new oss.PutObject({ bucket: bucket(), key, body: 'hello from the OSS TypeScript SDK', contentType: 'text/plain' }),
  )
  console.log('uploaded ' + key)
  console.log('  etag:      ' + result.etag)
  console.log('  requestId: ' + result.requestId)
} catch (error) {
  report(error)
}
