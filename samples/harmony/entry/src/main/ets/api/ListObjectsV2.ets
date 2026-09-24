// Demonstrates: List every object under a prefix, paging through the continuation token by hand.
import { ListObjectsV2 } from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig'

export async function run(prefix: string = 'sample/'): Promise<void> {
  try {
    const client = createClient()
    const name = bucket()
    let continuationToken: string | undefined = undefined
    let page = 0

    do {
      const result = await client.send(
        new ListObjectsV2({ bucket: name, prefix: prefix, maxKeys: 100, continuationToken: continuationToken }),
      )
      page += 1
      // `contents` is absent when nothing matched.
      console.log('page ' + page + ': ' + (result.contents?.length ?? 0) + ' keys')
      for (const entry of result.contents ?? []) {
        console.log('  ' + entry.key + '  ' + entry.size + ' B  ' + entry.lastModified)
      }
      continuationToken = result.isTruncated === true ? result.nextContinuationToken : undefined
    } while (continuationToken !== undefined)
  } catch (error) {
    report(error)
  }
}
