// Demonstrates: Create a bucket.
import { PutBucket } from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig'

export async function run(name: string = bucket()): Promise<void> {
  try {
    const result = await createClient().send(
      new PutBucket({ bucket: name, acl: 'private', createBucketConfiguration: { storageClass: 'Standard' } }),
    )
    console.log('created ' + name + ' (status ' + result.statusCode + ')')
    console.log('  requestId: ' + result.requestId)
  } catch (error) {
    report(error)
  }
}
