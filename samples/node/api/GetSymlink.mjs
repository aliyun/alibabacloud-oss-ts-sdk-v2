// Demonstrates: Read a symbolic link and the target it points to.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/link.txt'
const target = process.argv[3] ?? 'sample/target.txt'

try {
  const client = createClient()
  await client.send(new oss.PutObject({ bucket: bucket(), key: target, body: 'symlink target' }))
  await client.send(new oss.PutSymlink({ bucket: bucket(), key, symlinkTarget: target }))
  const result = await client.send(new oss.GetSymlink({ bucket: bucket(), key }))
  console.log(key + ' -> ' + result.symlinkTarget)
} catch (error) {
  report(error)
}
