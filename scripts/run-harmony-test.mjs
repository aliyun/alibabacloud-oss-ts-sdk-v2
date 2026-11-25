import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

/** The stub reports the port it bound on its first line; port 0 lets the OS pick a free one. */
const LISTENING = /listening on http:\/\/127\.0\.0\.1:(\d+)/
const STUB_PORT_FILE = 'ohos-har/oss-v2/src/test/mock/stub-port.ets'

/**
 * Hands the bound port to the ArkTS suite, which can only read a compiled constant, and restores the
 * committed file afterwards so a run never leaves the working tree modified.
 * @param {string} port
 * @returns {() => void}
 */
function useStubPort(port) {
  const original = readFileSync(STUB_PORT_FILE, 'utf8')
  writeFileSync(STUB_PORT_FILE, original.replace(/export const STUB_PORT: string = '[^']*'/, `export const STUB_PORT: string = '${port}'`))
  return () => writeFileSync(STUB_PORT_FILE, original)
}

/**
 * Forwards the stub log into the test output and resolves with the port the stub bound.
 * @param {import('node:child_process').ChildProcessByStdio<null, import('node:stream').Readable, null>} stub
 * @returns {Promise<string>}
 */
function readStubPort(stub) {
  return new Promise((resolve, reject) => {
    const lines = createInterface({ input: stub.stdout })
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) reject(new Error('the loopback stub did not report a port within 10 seconds'))
    }, 10000)
    lines.on('line', (line) => {
      console.log(line)
      const found = LISTENING.exec(line)
      if (!settled && found !== null) {
        settled = true
        clearTimeout(timer)
        resolve(found[1])
      }
    })
    lines.on('close', () => {
      if (!settled) reject(new Error('the loopback stub exited before reporting a port'))
    })
  })
}

// hvigor keeps the previous file when the task stops early, so the result gate could otherwise read a
// passing run that did not happen.
rmSync('ohos-har/oss-v2/.test/default/intermediates/test/coverage_data/test_result.txt', { force: true })

const stub = spawn('node', ['scripts/harmony-loopback-server.mjs', '0'], { stdio: ['ignore', 'pipe', 'inherit'] })
let restore = () => {}
let status = 1
try {
  restore = useStubPort(await readStubPort(stub))
  const test = spawnSync(
    'hvigorw',
    ['test', '-p', 'module=oss_v2', '-p', 'coverage=false', '--no-daemon'],
    { cwd: 'ohos-har', stdio: 'inherit', shell: true }
  )
  status = test.status ?? 1
} finally {
  stub.kill()
  restore()
}
if (status !== 0) {
  process.exit(status)
}
