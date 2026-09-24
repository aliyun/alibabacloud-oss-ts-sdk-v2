// Demonstrates: Delete an empty bucket.
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.js'

export async function run(log, name) {
  // OSS rejects the call unless the bucket is already empty; it defaults to the working bucket only
  // for convenience.
  const target = name !== undefined && name.length > 0 ? name : bucket()
  try {
    const result = await createClient().send(new oss.DeleteBucket({ bucket: target }))
    log('deleted ' + target + ' (status ' + String(result.statusCode) + ')')
  } catch (error) {
    report(error, log)
  }
}
