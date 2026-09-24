// Demonstrates: Set a bucket's versioning state to Enabled or Suspended.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const status = process.argv[2] ?? 'Enabled'

try {
  const client = createClient()
  const result = await client.send(
    new oss.PutBucketVersioning({ bucket: bucket(), versioningConfiguration: { status } }),
  )
  console.log('versioning set to ' + status + ', requestId: ' + result.requestId)
} catch (error) {
  report(error)
}
