// Demonstrates: Read a bucket's hotlink protection (Referer) configuration.
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

try {
  const client = createClient()
  const result = await client.send(new oss.GetBucketReferer({ bucket: bucket() }))
  const config = result.refererConfiguration
  console.log('allowEmptyReferer: ' + String(config?.allowEmptyReferer))
  console.log('whitelist: ' + (config?.refererList?.referers ?? []).join(', '))
  console.log('blacklist: ' + (config?.refererBlacklist?.referers ?? []).join(', '))
} catch (error) {
  report(error)
}
