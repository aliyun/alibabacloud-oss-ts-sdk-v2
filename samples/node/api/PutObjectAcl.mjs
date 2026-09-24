// Demonstrates: Set the ACL of an object.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/hello.txt'
const acl = process.argv[3] ?? 'private'

try {
  const client = createClient()
  await client.send(new oss.PutObject({ bucket: bucket(), key, body: 'acl sample' }))
  const result = await client.send(new oss.PutObjectAcl({ bucket: bucket(), key, objectAcl: acl }))
  console.log('set acl of ' + key + ' to ' + acl + ', requestId: ' + result.requestId)
} catch (error) {
  report(error)
}
