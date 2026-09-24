// Demonstrates: Read an object's metadata without downloading its body.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/hello.txt'

try {
  const result = await createClient().send(new oss.HeadObject({ bucket: bucket(), key }))
  console.log('metadata for ' + key)
  console.log('  etag:         ' + result.etag)
  console.log('  lastModified: ' + String(result.lastModified))
  console.log('  storageClass: ' + result.storageClass)
  console.log('  metadata:     ' + JSON.stringify(result.metadata ?? {}))
} catch (error) {
  report(error)
}
