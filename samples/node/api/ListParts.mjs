// Demonstrates: List the parts already uploaded for a multipart upload.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/multipart.bin'

try {
  const client = createClient()
  const initiated = await client.send(new oss.InitiateMultipartUpload({ bucket: bucket(), key }))
  const uploadId = initiated.uploadId

  await client.send(new oss.UploadPart({ bucket: bucket(), key, uploadId, partNumber: 1, body: 'first part' }))

  const listed = await client.send(new oss.ListParts({ bucket: bucket(), key, uploadId }))
  for (const part of listed.parts ?? []) {
    console.log('part ' + String(part.partNumber) + ', size: ' + String(part.size) + ', etag: ' + String(part.etag))
  }

  await client.send(new oss.AbortMultipartUpload({ bucket: bucket(), key, uploadId }))
} catch (error) {
  report(error)
}
