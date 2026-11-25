import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

/** The stub reports the ports it resolved on its first two lines; port 0 lets the OS pick a free one. */
const LISTENING = /listening on http:\/\/127\.0\.0\.1:(\d+)/
const DEAD = /dead port (\d+)/
const STUB_PORTS_FILE = 'ohos-har/oss-v2/src/test/mock/stub-ports.ets'

/**
 * Hands the resolved ports to the ArkTS suite, which can only read a compiled constant, and restores the
 * committed file afterwards so a run never leaves the working tree modified.
 * @param {{stub: string, dead: string}} ports
 * @returns {() => void}
 */
function useStubPorts(ports) {
  const original = readFileSync(STUB_PORTS_FILE, 'utf8')
  /**
   * @param {string} text
   * @param {string} name
   * @param {string} value
   * @returns {string}
   */
  const rewrite = (text, name, value) =>
    text.replace(new RegExp(`export const ${name}: string = '[^']*'`), `export const ${name}: string = '${value}'`)
  writeFileSync(STUB_PORTS_FILE, rewrite(rewrite(original, 'STUB_PORT', ports.stub), 'DEAD_PORT', ports.dead))
  return () => writeFileSync(STUB_PORTS_FILE, original)
}

/**
 * Forwards the stub log into the test output and resolves with the ports the stub bound.
 * @param {import('node:child_process').ChildProcessByStdio<null, import('node:stream').Readable, null>} stub
 * @returns {Promise<{stub: string, dead: string}>}
 */
function readPorts(stub) {
  return new Promise((resolve, reject) => {
    /** @type {Record<string, string>} */
    const found = {}
    const timer = setTimeout(() => {
      reject(new Error('the loopback stub did not report its ports within 10 seconds'))
    }, 10000)
    createInterface({ input: stub.stdout }).on('line', (line) => {
      console.log(line)
      const listening = LISTENING.exec(line)
      if (listening !== null) found.stub = listening[1]
      const dead = DEAD.exec(line)
      if (dead !== null) found.dead = dead[1]
      if (found.stub !== undefined && found.dead !== undefined) {
        clearTimeout(timer)
        resolve({ stub: found.stub, dead: found.dead })
      }
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
  restore = useStubPorts(await readPorts(stub))
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
