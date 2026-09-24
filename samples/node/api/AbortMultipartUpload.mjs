// Demonstrates: Cancel a multipart upload and free the parts already stored.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/multipart.bin'

try {
  const client = createClient()
  const initiated = await client.send(new oss.InitiateMultipartUpload({ bucket: bucket(), key }))
  await client.send(new oss.AbortMultipartUpload({ bucket: bucket(), key, uploadId: initiated.uploadId }))
  console.log('aborted upload ' + String(initiated.uploadId))
} catch (error) {
  report(error)
}
