// Demonstrates: Read a bucket's versioning state.
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

try {
  const client = createClient()
  const result = await client.send(new oss.GetBucketVersioning({ bucket: bucket() }))
  console.log('status: ' + (result.versioningConfiguration?.status ?? '(never versioned)'))
} catch (error) {
  report(error)
}
