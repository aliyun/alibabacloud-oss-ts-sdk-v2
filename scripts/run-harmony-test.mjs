import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'

// hvigor keeps the previous file when the task stops early, so the result gate could otherwise read a
// passing run that did not happen.
rmSync('ohos-har/oss-v2/.test/default/intermediates/test/coverage_data/test_result.txt', { force: true })

const test = spawnSync(
  'hvigorw',
  ['test', '-p', 'module=oss_v2', '-p', 'coverage=false', '--no-daemon'],
  { cwd: 'ohos-har', stdio: 'inherit', shell: true }
)
if (test.status !== 0) {
  process.exit(test.status ?? 1)
}
