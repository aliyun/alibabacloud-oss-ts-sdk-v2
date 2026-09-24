// Demonstrates: Create a symbolic link that points to a target object.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/link.txt'
const target = process.argv[3] ?? 'sample/target.txt'

try {
  const client = createClient()
  await client.send(new oss.PutObject({ bucket: bucket(), key: target, body: 'symlink target' }))
  const result = await client.send(new oss.PutSymlink({ bucket: bucket(), key, symlinkTarget: target }))
  console.log('created symlink ' + key + ' -> ' + target + ', requestId: ' + result.requestId)
} catch (error) {
  report(error)
}
