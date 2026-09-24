// Demonstrates: Read the tags attached to an object.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/hello.txt'

try {
  const client = createClient()
  await client.send(new oss.PutObject({ bucket: bucket(), key, body: 'tagging sample' }))
  await client.send(
    new oss.PutObjectTagging({ bucket: bucket(), key, tagging: { tagSet: { tags: [{ key: 'env', value: 'demo' }] } } }),
  )
  const result = await client.send(new oss.GetObjectTagging({ bucket: bucket(), key }))
  for (const tag of result.tagging?.tagSet?.tags ?? []) {
    console.log(String(tag.key) + '=' + String(tag.value))
  }
} catch (error) {
  report(error)
}
