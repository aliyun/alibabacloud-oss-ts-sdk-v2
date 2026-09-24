// Demonstrates: Read an object's metadata without downloading its body.
import { HeadObject } from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig'

export async function run(key: string = 'sample/hello.txt'): Promise<void> {
  try {
    const result = await createClient().send(new HeadObject({ bucket: bucket(), key: key }))
    console.log('metadata for ' + key)
    console.log('  etag:         ' + result.etag)
    console.log('  lastModified: ' + result.lastModified)
    console.log('  storageClass: ' + result.storageClass)
    console.log('  metadata:     ' + JSON.stringify(result.metadata ?? {}))
  } catch (error) {
    report(error)
  }
}
