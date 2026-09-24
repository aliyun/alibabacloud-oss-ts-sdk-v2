// Demonstrates: Presign a GET URL that a browser or curl can fetch without the SDK or any credentials.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/hello.txt'

try {
  const result = await createClient().presign(new oss.GetObject({ bucket: bucket(), key }), {
    expiresInSeconds: 600,
  })
  console.log('presigned ' + result.method + ' URL for ' + key)
  console.log('  url:        ' + result.url)
  console.log('  expiration: ' + String(result.expiration))
  // Whoever calls the URL must send these headers unchanged, or the signature fails. Empty for the
  // common case of a URL that needs none.
  console.log('  signedHeaders: ' + JSON.stringify(result.signedHeaders))
} catch (error) {
  report(error)
}
