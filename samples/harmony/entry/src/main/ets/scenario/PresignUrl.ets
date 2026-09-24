// Demonstrates: Presign a GET URL that a browser or curl can fetch without the SDK or any credentials.
import { GetObject } from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig'

export async function run(key: string = 'sample/hello.txt'): Promise<void> {
  try {
    const result = await createClient().presign(new GetObject({ bucket: bucket(), key: key }), {
      expiresInSeconds: 600,
    })
    console.log('presigned ' + result.method + ' URL for ' + key)
    console.log('  url:        ' + result.url)
    console.log('  expiration: ' + result.expiration)
    // Whoever calls the URL must send these headers unchanged, or the signature fails. Empty for the
    // common case of a URL that needs none.
    console.log('  signedHeaders: ' + JSON.stringify(result.signedHeaders))
  } catch (error) {
    report(error)
  }
}
