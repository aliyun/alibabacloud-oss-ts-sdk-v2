// Demonstrates: Download an object and read its body.
import { GetObject } from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig'

export async function run(key: string = 'sample/hello.txt'): Promise<void> {
  try {
    const result = await createClient().send(new GetObject({ bucket: bucket(), key: key }))
    console.log('downloaded ' + key)
    console.log('  contentType:   ' + result.contentType)
    console.log('  contentLength: ' + result.contentLength)
    // The body is buffered in memory and capped at 100 MiB by netstack.
    const body: string = (await result.body?.text()) ?? ''
    const limit = 512
    const shown: string =
      body.length > limit ? body.slice(0, limit) + ' ... (' + body.length + ' chars)' : body
    console.log('  body:          ' + shown)
  } catch (error) {
    report(error)
  }
}
