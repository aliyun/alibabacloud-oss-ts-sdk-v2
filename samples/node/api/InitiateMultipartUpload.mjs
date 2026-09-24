// Demonstrates: Start a multipart upload and obtain the upload id the parts reference.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/multipart.bin'

try {
  const client = createClient()
  const initiated = await client.send(new oss.InitiateMultipartUpload({ bucket: bucket(), key }))
  console.log('upload id: ' + String(initiated.uploadId))
  // Nothing was uploaded, so abort it to leave no in-progress upload behind.
  await client.send(new oss.AbortMultipartUpload({ bucket: bucket(), key, uploadId: initiated.uploadId }))
  console.log('aborted')
} catch (error) {
  report(error)
}
