// Demonstrates: List the versions and delete markers of objects under a prefix, paging by hand.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const prefix = process.argv[2] ?? 'sample/'

try {
  const client = createClient()
  const name = bucket()
  let keyMarker = undefined
  let versionIdMarker = undefined
  let page = 0

  do {
    const result = await client.send(
      new oss.ListObjectVersions({ bucket: name, prefix, maxKeys: 100, keyMarker, versionIdMarker }),
    )
    page += 1
    console.log('page ' + String(page))
    for (const entry of result.versions ?? []) {
      console.log('  version      ' + entry.key + '  ' + entry.versionId + (entry.isLatest === true ? '  (latest)' : ''))
    }
    for (const entry of result.deleteMarkers ?? []) {
      console.log('  deleteMarker ' + entry.key + '  ' + entry.versionId)
    }
    if (result.isTruncated === true) {
      keyMarker = result.nextKeyMarker
      versionIdMarker = result.nextVersionIdMarker
    } else {
      keyMarker = undefined
      versionIdMarker = undefined
    }
  } while (keyMarker !== undefined)
} catch (error) {
  report(error)
}
