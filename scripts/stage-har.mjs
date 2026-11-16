import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'

const HAR_MODULE = 'ohos-har/oss-v2'
const STAGED = `${HAR_MODULE}/src/main/ets`
const HARMONY_ENTRIES = ['default-transport', 'client-extensions', 'mime-type', 'text-codec']

rmSync(STAGED, { recursive: true, force: true })
mkdirSync(`${STAGED}/runtime`, { recursive: true })
for (const entry of readdirSync('dist/esm')) {
  if (entry !== 'runtime') {
    cpSync(`dist/esm/${entry}`, `${STAGED}/${entry}`, { recursive: true })
  }
}
cpSync('dist/esm/runtime/harmony', `${STAGED}/runtime/harmony`, { recursive: true })
for (const name of HARMONY_ENTRIES) {
  cpSync(`dist/esm/runtime/${name}.harmony.js`, `${STAGED}/runtime/${name}.js`)
  cpSync(`dist/esm/runtime/${name}.harmony.d.ts`, `${STAGED}/runtime/${name}.d.ts`)
}

const pkg = /** @type {unknown} */ (JSON.parse(readFileSync('package.json', 'utf8')))
if (pkg === null || typeof pkg !== 'object' || !('version' in pkg) || typeof pkg.version !== 'string') {
  throw new Error('package.json has no version field')
}
const manifestPath = `${HAR_MODULE}/oh-package.json5`
writeFileSync(manifestPath, readFileSync(manifestPath, 'utf8').replace(/"version": "[^"]*"/, `"version": "${pkg.version}"`))

console.log(`staged dist/esm into ${STAGED} as @alicloud/oss-v2@${pkg.version}`)
