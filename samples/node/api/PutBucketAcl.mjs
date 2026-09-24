// Demonstrates: Set a bucket's ACL to private, public-read or public-read-write.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const acl = process.argv[2] ?? 'private'

try {
  const client = createClient()
  const result = await client.send(new oss.PutBucketAcl({ bucket: bucket(), acl }))
  console.log('acl set to ' + acl + ', requestId: ' + result.requestId)
} catch (error) {
  report(error)
}
