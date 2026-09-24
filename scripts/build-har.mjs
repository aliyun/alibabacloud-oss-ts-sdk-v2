import { spawnSync } from 'node:child_process'
import { copyFileSync, readFileSync, rmSync } from 'node:fs'

const PROJECT = 'ohos-har'
const ARTIFACT = `${PROJECT}/oss-v2/build/default/outputs/default/oss_v2.har`

rmSync(`${PROJECT}/oss-v2/build`, { recursive: true, force: true })
const build = spawnSync(
  'hvigorw',
  ['assembleHar', '--mode', 'module', '-p', 'product=default', '-p', 'buildMode=debug', '--no-daemon'],
  { cwd: PROJECT, stdio: 'inherit', shell: true }
)
if (build.status !== 0) {
  process.exit(build.status ?? 1)
}

const manifest = /** @type {unknown} */ (JSON.parse(readFileSync('package.json', 'utf8')))
if (manifest === null || typeof manifest !== 'object' || !('version' in manifest) || typeof manifest.version !== 'string') {
  throw new Error('package.json has no version field')
}
const target = `alicloud-oss-v2-${manifest.version}.har`
copyFileSync(ARTIFACT, target)
console.log(`built ${target}`)
