// Demonstrates: List the OSS regions and their endpoints, or one region named on the command line.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { createClient, report } from '../SampleConfig.mjs'

const regions = process.argv[2]

try {
  const client = createClient()
  const result = await client.send(new oss.DescribeRegions({ regions }))
  for (const entry of result.regionInfo ?? []) {
    console.log(entry.region)
    console.log('  internet: ' + entry.internetEndpoint)
    console.log('  internal: ' + entry.internalEndpoint)
    console.log('  accelerate: ' + entry.accelerateEndpoint)
  }
} catch (error) {
  report(error)
}
