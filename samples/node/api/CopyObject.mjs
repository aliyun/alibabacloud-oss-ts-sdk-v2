// Demonstrates: Copy an object to another key within the same bucket.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const sourceKey = process.argv[2] ?? 'sample/hello.txt'
const key = process.argv[3] ?? 'sample/hello-copy.txt'

try {
  const result = await createClient().send(new oss.CopyObject({ bucket: bucket(), key, sourceKey }))
  console.log('copied ' + sourceKey + ' to ' + key)
  console.log('etag: ' + String(result.etag))
  console.log('lastModified: ' + String(result.lastModified?.toISOString()))
} catch (error) {
  report(error)
}
