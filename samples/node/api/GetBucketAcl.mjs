// Demonstrates: Read a bucket's ACL and owner.
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

try {
  const client = createClient()
  const result = await client.send(new oss.GetBucketAcl({ bucket: bucket() }))
  const policy = result.accessControlPolicy
  console.log('grant: ' + policy?.accessControlList?.grant)
  console.log('owner: ' + policy?.owner?.id)
} catch (error) {
  report(error)
}
