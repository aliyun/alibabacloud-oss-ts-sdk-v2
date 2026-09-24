// Demonstrates: List every object under a prefix in the V1 style, paging through the marker by hand.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const prefix = process.argv[2] ?? 'sample/'

try {
  const client = createClient()
  const name = bucket()
  let marker = undefined
  let page = 0

  do {
    const result = await client.send(new oss.ListObjects({ bucket: name, prefix, maxKeys: 100, marker }))
    page += 1
    console.log('page ' + String(page) + ': ' + String(result.contents?.length ?? 0) + ' keys')
    for (const entry of result.contents ?? []) {
      console.log('  ' + entry.key + '  ' + String(entry.size) + ' B  ' + String(entry.lastModified))
    }
    marker = result.isTruncated === true ? result.nextMarker : undefined
  } while (marker !== undefined)
} catch (error) {
  report(error)
}
