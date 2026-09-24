// Demonstrates: Create a bucket.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

// A bucket name is global to a region, so pass a fresh one as the argument rather than reusing the
// working bucket from OSS_BUCKET, which already exists.
const name = process.argv[2] ?? bucket()

try {
  const result = await createClient().send(
    new oss.PutBucket({ bucket: name, acl: 'private', createBucketConfiguration: { storageClass: 'Standard' } }),
  )
  console.log('created ' + name + ' (status ' + String(result.statusCode) + ')')
  console.log('  requestId: ' + result.requestId)
} catch (error) {
  report(error)
}
