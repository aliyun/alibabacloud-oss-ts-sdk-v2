// Demonstrates: Submit an async media conversion task that saves the result as a new object.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/video.mp4'
const target = process.argv[3] ?? 'sample/video-converted.mp4'

// `sys/saveas` takes the target key and bucket as base64.
const b64 = (value) => Buffer.from(value, 'utf8').toString('base64')
const instruction = 'video/convert,f_mp4|sys/saveas,o_' + b64(target) + ',b_' + b64(bucket())

try {
  const result = await createClient().send(new oss.AsyncProcessObject({ bucket: bucket(), key, process: instruction }))
  console.log('submitted async task, requestId: ' + result.requestId)
  // The service reports the task's `EventId`, `RequestId` and `TaskId` as a JSON string.
  console.log('  report: ' + String(result.body))
} catch (error) {
  report(error)
}
