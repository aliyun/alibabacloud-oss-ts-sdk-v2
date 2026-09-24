// Demonstrates: Read a bucket's storage usage and object counts, broken down by storage class.
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

try {
  const client = createClient()
  const result = await client.send(new oss.GetBucketStat({ bucket: bucket() }))
  const stat = result.bucketStat
  console.log('storage bytes:       ' + String(stat?.storage))
  console.log('object count:        ' + String(stat?.objectCount))
  console.log('multipart uploads:   ' + String(stat?.multipartUploadCount))
  console.log('live channels:       ' + String(stat?.liveChannelCount))
  console.log('standard storage:    ' + String(stat?.standardStorage))
  console.log('archive storage:     ' + String(stat?.archiveStorage))
  console.log('cold archive storage:' + String(stat?.coldArchiveStorage))
} catch (error) {
  report(error)
}
