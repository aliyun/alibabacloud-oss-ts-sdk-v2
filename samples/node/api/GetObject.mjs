// Demonstrates: Download an object and read its body.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/hello.txt'

try {
  const result = await createClient().send(new oss.GetObject({ bucket: bucket(), key }))
  console.log('downloaded ' + key)
  console.log('  contentType:   ' + result.contentType)
  console.log('  contentLength: ' + String(result.contentLength))
  const body = (await result.body?.text()) ?? ''
  const limit = 512
  const shown =
    body.length > limit ? body.slice(0, limit) + ' ... (' + String(body.length) + ' chars)' : body
  console.log('  body:          ' + shown)
} catch (error) {
  report(error)
}
