// Demonstrates: Delete an empty bucket.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

// Pass the bucket to delete as the argument; it defaults to OSS_BUCKET only for convenience. OSS
// rejects the call unless the bucket is already empty.
const name = process.argv[2] ?? bucket()

try {
  const result = await createClient().send(new oss.DeleteBucket({ bucket: name }))
  console.log('deleted ' + name + ' (status ' + String(result.statusCode) + ')')
} catch (error) {
  report(error)
}
