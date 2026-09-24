// Demonstrates: List every bucket the credentials own, paging through the marker by hand.
import * as oss from '@alicloud/oss-v2'
import { createClient, report } from '../SampleConfig.mjs'

try {
  const client = createClient()
  let marker = undefined
  let page = 0

  do {
    const result = await client.send(new oss.ListBuckets({ maxKeys: 100, marker }))
    page += 1
    console.log('page ' + String(page) + ': ' + String(result.buckets?.length ?? 0) + ' buckets')
    for (const entry of result.buckets ?? []) {
      console.log('  ' + entry.name + '  ' + entry.region + '  ' + entry.storageClass)
    }
    marker = result.isTruncated === true ? result.nextMarker : undefined
  } while (marker !== undefined)
} catch (error) {
  report(error)
}
