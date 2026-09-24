// Demonstrates: Read an object's metadata without downloading its body.
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.js'

export async function run(log, key = 'sample/hello.txt') {
  try {
    const result = await createClient().send(new oss.HeadObject({ bucket: bucket(), key }))
    log('metadata for ' + key)
    log('  etag:         ' + result.etag)
    log('  lastModified: ' + String(result.lastModified))
    log('  storageClass: ' + result.storageClass)
    log('  metadata:     ' + JSON.stringify(result.metadata ?? {}))
  } catch (error) {
    report(error, log)
  }
}
