// Demonstrates: Delete an object.
import { DeleteObject } from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig'

export async function run(key: string = 'sample/hello.txt'): Promise<void> {
  try {
    const result = await createClient().send(new DeleteObject({ bucket: bucket(), key: key }))
    // 204 whether or not the key was there: deleting a missing key is a success, not an error.
    console.log('deleted ' + key + ' (status ' + result.statusCode + ')')
  } catch (error) {
    report(error)
  }
}
