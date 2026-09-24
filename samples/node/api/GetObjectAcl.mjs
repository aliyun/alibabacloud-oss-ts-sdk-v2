// Demonstrates: Read the ACL of an object.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/hello.txt'

try {
  const client = createClient()
  await client.send(new oss.PutObject({ bucket: bucket(), key, body: 'acl sample' }))
  const result = await client.send(new oss.GetObjectAcl({ bucket: bucket(), key }))
  console.log('grant: ' + result.accessControlPolicy?.accessControlList?.grant)
  console.log('owner: ' + result.accessControlPolicy?.owner?.id)
} catch (error) {
  report(error)
}
