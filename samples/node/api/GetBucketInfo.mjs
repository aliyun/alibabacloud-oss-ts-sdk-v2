// Demonstrates: Read a bucket's configuration -- region, endpoints, owner, ACL, encryption, versioning.
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

try {
  const client = createClient()
  const result = await client.send(new oss.GetBucketInfo({ bucket: bucket() }))
  const info = result.bucketInfo
  console.log('name:        ' + info?.name)
  console.log('location:    ' + info?.location)
  console.log('storage:     ' + info?.storageClass)
  console.log('redundancy:  ' + info?.dataRedundancyType)
  console.log('created:     ' + info?.creationDate)
  console.log('acl:         ' + info?.accessControlList?.grant)
  console.log('versioning:  ' + info?.versioning)
  console.log('owner:       ' + info?.owner?.id)
} catch (error) {
  report(error)
}
