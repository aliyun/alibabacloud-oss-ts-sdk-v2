// Demonstrates: Read the small fixed set of object metadata without the stored user metadata.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/hello.txt'

try {
  const result = await createClient().send(new oss.GetObjectMeta({ bucket: bucket(), key }))
  console.log('contentLength: ' + String(result.contentLength))
  console.log('etag: ' + String(result.etag))
  console.log('lastModified: ' + String(result.lastModified?.toISOString()))
} catch (error) {
  report(error)
}
