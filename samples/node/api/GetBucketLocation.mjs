// Demonstrates: Read the region a bucket lives in, e.g. oss-cn-hangzhou.
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

try {
  const client = createClient()
  const result = await client.send(new oss.GetBucketLocation({ bucket: bucket() }))
  console.log('location: ' + result.locationConstraint)
} catch (error) {
  report(error)
}
