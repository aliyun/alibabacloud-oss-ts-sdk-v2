// Demonstrates: List the multipart uploads that have started but not completed or aborted.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/multipart.bin'

try {
  const client = createClient()
  const initiated = await client.send(new oss.InitiateMultipartUpload({ bucket: bucket(), key }))

  const listed = await client.send(new oss.ListMultipartUploads({ bucket: bucket(), prefix: 'sample/' }))
  for (const upload of listed.uploads ?? []) {
    console.log(String(upload.key) + '\t' + String(upload.uploadId))
  }

  await client.send(new oss.AbortMultipartUpload({ bucket: bucket(), key, uploadId: initiated.uploadId }))
} catch (error) {
  report(error)
}
