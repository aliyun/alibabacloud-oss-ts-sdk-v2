import { spawnSync } from 'node:child_process'

const test = spawnSync(
  'hvigorw',
  ['test', '-p', 'module=oss_v2', '-p', 'coverage=false', '--no-daemon'],
  { cwd: 'ohos-har', stdio: 'inherit', shell: true }
)
if (test.status !== 0) {
  process.exit(test.status ?? 1)
}
