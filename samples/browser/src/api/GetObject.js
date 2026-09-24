// Demonstrates: Download an object and read its body.
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.js'

export async function run(log, key = 'sample/hello.txt') {
  try {
    const result = await createClient().send(new oss.GetObject({ bucket: bucket(), key }))
    log('downloaded ' + key)
    log('  contentType:   ' + result.contentType)
    log('  contentLength: ' + String(result.contentLength))
    const body = (await result.body?.text()) ?? ''
    const limit = 512
    const shown =
      body.length > limit ? body.slice(0, limit) + ' ... (' + String(body.length) + ' chars)' : body
    log('  body:          ' + shown)
  } catch (error) {
    report(error, log)
  }
}
