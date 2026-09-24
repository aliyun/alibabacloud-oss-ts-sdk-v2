// Demonstrates: Delete several objects in one request.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const keys = process.argv.slice(2)
if (keys.length === 0) keys.push('sample/a.txt', 'sample/b.txt')

try {
  const result = await createClient().send(
    new oss.DeleteMultipleObjects({ bucket: bucket(), objects: keys.map((key) => ({ key })) }),
  )
  for (const object of result.deleted ?? []) console.log('deleted ' + String(object.key))
} catch (error) {
  report(error)
}
