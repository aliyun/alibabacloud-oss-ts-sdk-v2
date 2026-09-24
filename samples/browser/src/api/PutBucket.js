// Demonstrates: Create a bucket.
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.js'

export async function run(log, name) {
  // A bucket name is global to a region, so pass a fresh one rather than reusing the working bucket,
  // which already exists.
  const target = name !== undefined && name.length > 0 ? name : bucket()
  try {
    const result = await createClient().send(
      new oss.PutBucket({ bucket: target, acl: 'private', createBucketConfiguration: { storageClass: 'Standard' } }),
    )
    log('created ' + target + ' (status ' + String(result.statusCode) + ')')
    log('  requestId: ' + result.requestId)
  } catch (error) {
    report(error, log)
  }
}
