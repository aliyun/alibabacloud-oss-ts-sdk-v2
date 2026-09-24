// Demonstrates: Restore an Archive object into a readable state.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/archived.dat'

try {
  const result = await createClient().send(
    new oss.RestoreObject({ bucket: bucket(), key, restoreRequest: { days: 1 } }),
  )
  // 202 Accepted starts the restore; the object becomes readable once it finishes.
  console.log('restore accepted (status ' + String(result.statusCode) + ')')
} catch (error) {
  report(error)
}
