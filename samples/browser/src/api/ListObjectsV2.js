// Demonstrates: List every object under a prefix, paging through the continuation token by hand.
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.js'

export async function run(log, prefix = 'sample/') {
  try {
    const client = createClient()
    const name = bucket()
    let continuationToken = undefined
    let page = 0

    do {
      const result = await client.send(new oss.ListObjectsV2({ bucket: name, prefix, maxKeys: 100, continuationToken }))
      page += 1
      log('page ' + String(page) + ': ' + String(result.contents?.length ?? 0) + ' keys')
      for (const entry of result.contents ?? []) {
        log('  ' + entry.key + '  ' + String(entry.size) + ' B  ' + String(entry.lastModified))
      }
      continuationToken = result.isTruncated === true ? result.nextContinuationToken : undefined
    } while (continuationToken !== undefined)
  } catch (error) {
    report(error, log)
  }
}
