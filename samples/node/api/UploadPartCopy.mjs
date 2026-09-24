// Demonstrates: Upload one part by copying a range from an existing object.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const sourceKey = process.argv[2] ?? 'sample/source.bin'
const key = process.argv[3] ?? 'sample/copied-multipart.bin'

try {
  const client = createClient()
  await client.send(new oss.PutObject({ bucket: bucket(), key: sourceKey, body: 'copied from the source object' }))

  const initiated = await client.send(new oss.InitiateMultipartUpload({ bucket: bucket(), key }))
  const uploadId = initiated.uploadId

  const part = await client.send(
    new oss.UploadPartCopy({ bucket: bucket(), key, uploadId, partNumber: 1, sourceKey }),
  )
  console.log('copied part 1, etag: ' + String(part.etag))

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
