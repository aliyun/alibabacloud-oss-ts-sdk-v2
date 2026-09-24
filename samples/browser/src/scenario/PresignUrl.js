// Demonstrates: Presign a GET URL that a page or curl can fetch without the SDK or any credentials.
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.js'

export async function run(log, key = 'sample/hello.txt') {
  try {
    const result = await createClient().presign(new oss.GetObject({ bucket: bucket(), key }), {
      expiresInSeconds: 600,
    })
    log('presigned ' + result.method + ' URL for ' + key)
    log('  url:        ' + result.url)
    log('  expiration: ' + String(result.expiration))
    // Whoever calls the URL must send these headers unchanged, or the signature fails. Empty for the
    // common case of a URL that needs none.
    log('  signedHeaders: ' + JSON.stringify(result.signedHeaders))
  } catch (error) {
    report(error, log)
  }
}
