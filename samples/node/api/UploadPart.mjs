// Demonstrates: Upload one part of a multipart upload.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/multipart.bin'

try {
  const client = createClient()
  const initiated = await client.send(new oss.InitiateMultipartUpload({ bucket: bucket(), key }))
  const uploadId = initiated.uploadId

  const part = await client.send(
    new oss.UploadPart({ bucket: bucket(), key, uploadId, partNumber: 1, body: 'the only part' }),
  )
  console.log('uploaded part 1, etag: ' + String(part.etag))

  await client.send(
    new oss.CompleteMultipartUpload({
      bucket: bucket(),
      key,
      uploadId,
      parts: [{ partNumber: 1, etag: part.etag }],
    }),
  )
  console.log('completed')
} catch (error) {
  report(error)
}
