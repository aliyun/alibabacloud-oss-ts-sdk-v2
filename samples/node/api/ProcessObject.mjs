// Demonstrates: Resize an image and save the result as a new object.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/image.jpg'
const target = process.argv[3] ?? 'sample/image-100w.jpg'

// `sys/saveas` takes the target key and bucket as base64.
const b64 = (value) => Buffer.from(value, 'utf8').toString('base64')
const instruction = 'image/resize,w_100|sys/saveas,o_' + b64(target) + ',b_' + b64(bucket())

try {
  const result = await createClient().send(new oss.ProcessObject({ bucket: bucket(), key, process: instruction }))
  console.log('processed ' + key + ', requestId: ' + result.requestId)
  // The service reports the outcome as a JSON string, e.g. `{"bucket":...,"object":...,"status":"OK"}`.
  console.log('  report: ' + String(result.body))
} catch (error) {
  report(error)
}
