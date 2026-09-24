// Demonstrates: Attach tags to an object.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/hello.txt'

try {
  const client = createClient()
  await client.send(new oss.PutObject({ bucket: bucket(), key, body: 'tagging sample' }))
  const result = await client.send(
    new oss.PutObjectTagging({
      bucket: bucket(),
      key,
      tagging: { tagSet: { tags: [{ key: 'env', value: 'demo' }, { key: 'team', value: 'oss' }] } },
    }),
  )
  console.log('tagged ' + key + ', requestId: ' + result.requestId)
} catch (error) {
  report(error)
}
