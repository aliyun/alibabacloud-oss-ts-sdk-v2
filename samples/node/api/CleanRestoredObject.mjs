// Demonstrates: Discard the readable copy of a restored object ahead of its expiry.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/archived.dat'

try {
  const result = await createClient().send(new oss.CleanRestoredObject({ bucket: bucket(), key }))
  console.log('cleaned restored copy of ' + key + ' (status ' + String(result.statusCode) + ')')
} catch (error) {
  report(error)
}
