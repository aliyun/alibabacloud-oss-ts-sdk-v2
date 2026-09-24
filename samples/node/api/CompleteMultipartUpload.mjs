// Demonstrates: Assemble the uploaded parts into the final object.
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

  const completed = await client.send(
    new oss.CompleteMultipartUpload({
      bucket: bucket(),
      key,
      uploadId,
      parts: [{ partNumber: 1, etag: part.etag }],
    }),
  )
  console.log('object: ' + String(completed.key) + ', etag: ' + String(completed.etag))
} catch (error) {
  report(error)
}
