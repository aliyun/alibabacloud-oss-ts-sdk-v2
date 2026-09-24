// Demonstrates: Delete an object.
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.js'

export async function run(log, key = 'sample/hello.txt') {
  try {
    const result = await createClient().send(new oss.DeleteObject({ bucket: bucket(), key }))
    // 204 whether or not the key was there: deleting a missing key is a success, not an error.
    log('deleted ' + key + ' (status ' + String(result.statusCode) + ')')
  } catch (error) {
    report(error, log)
  }
}
