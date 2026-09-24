// Demonstrates: Set a bucket's hotlink protection (Referer) whitelist.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const referers = process.argv.slice(2)

try {
  const client = createClient()
  const result = await client.send(
    new oss.PutBucketReferer({
      bucket: bucket(),
      refererConfiguration: { allowEmptyReferer: true, refererList: { referers } },
    }),
  )
  console.log('referer whitelist set to [' + referers.join(', ') + '], requestId: ' + result.requestId)
} catch (error) {
  report(error)
}
