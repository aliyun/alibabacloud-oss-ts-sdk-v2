// Demonstrates: Delete an empty bucket.
import { DeleteBucket } from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig'

// The bucket defaults to the working bucket and must be empty.
export async function run(name: string = bucket()): Promise<void> {
  try {
    const result = await createClient().send(new DeleteBucket({ bucket: name }))
    console.log('deleted ' + name + ' (status ' + result.statusCode + ')')
  } catch (error) {
    report(error)
  }
}
