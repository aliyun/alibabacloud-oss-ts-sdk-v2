// Demonstrates: Append data to an appendable object across two calls.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/appendable.txt'

try {
  const client = createClient()
  // The first append starts at position 0 and creates the object.
  const first = await client.send(new oss.AppendObject({ bucket: bucket(), key, position: 0, body: 'hello ' }))
  console.log('appended, next position: ' + String(first.nextAppendPosition))
  // Each later append starts where the previous one reported it ended.
  const second = await client.send(
    new oss.AppendObject({ bucket: bucket(), key, position: first.nextAppendPosition, body: 'world' }),
  )
  console.log('appended, next position: ' + String(second.nextAppendPosition))
} catch (error) {
  report(error)
}
