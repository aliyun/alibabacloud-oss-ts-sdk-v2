import process from 'node:process'
import { existsSync, readFileSync } from 'node:fs'

/**
 * hvigorw test exits 0 whatever the cases did, so the workflow gates on the file hvigor writes.
 * The runner deletes it before the task, which is what makes a missing file mean "this run produced
 * no result" rather than "this run inherited the previous one".
 */
const RESULT_FILE = 'ohos-har/oss-v2/.test/default/intermediates/test/coverage_data/test_result.txt'

const SUMMARY = /^Tests run: (\d+), Failure: (\d+), Error: (\d+), Pass: (\d+), Ignore: (\d+)$/

const OUTCOMES = ['Success', 'Failure', 'Error', 'Ignore']

/** @param {string} message @returns {never} */
function fail(message) {
  console.error(`::error::ArkTS result gate: ${message}`)
  process.exit(1)
}

/**
 * @param {string[]} argv
 * @returns {number}
 */
function parseMinTests(argv) {
  let floor = 1
  for (let i = 0; i < argv.length; i += 1) {
    const inline = /^--min-tests=(.*)$/.exec(argv[i])
    const value = inline !== null ? inline[1] : argv[i] === '--min-tests' ? argv[++i] : undefined
    if (value === undefined) fail(`unsupported argument ${String(argv[i])}`)
    if (!/^\d+$/.test(value) || Number(value) < 1) fail(`--min-tests needs a positive integer, got ${value}`)
    floor = Number(value)
  }
  return floor
}

/**
 * A case is a `test=` line followed by its `result=` line; the `class=` lines only group them.
 * @param {string} text
 * @returns {{ name: string, outcome: string }[]}
 */
function readCases(text) {
  const cases = []
  let name = ''
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('test=')) name = line.slice('test='.length)
    else if (line.startsWith('result=')) {
      cases.push({ name, outcome: line.slice('result='.length) })
      name = ''
    }
  }
  return cases
}

const floor = parseMinTests(process.argv.slice(2))

if (!existsSync(RESULT_FILE)) fail(`${RESULT_FILE} does not exist, so the test task never wrote a result`)

const text = readFileSync(RESULT_FILE, 'utf8')
const lines = text.split(/\r?\n/)
const cases = readCases(text)
const summaryLine = lines.find((line) => SUMMARY.test(line))

if (summaryLine === undefined) {
  fail(`${cases.length} case(s) recorded but the file has no "Tests run: ..." summary, so the run was cut short`)
}
const summary = /** @type {RegExpExecArray} */ (SUMMARY.exec(summaryLine))
const [reported, failures, errors, passes, ignores] = summary.slice(1).map(Number)

console.log(`${String(passes)} of ${String(reported)} cases succeeded`)

if (cases.length !== reported) fail(`${cases.length} cases are recorded but the summary says ${String(reported)}`)
if (reported < floor) fail(`${String(reported)} cases ran, fewer than the required ${String(floor)}`)
if (failures + errors + passes + ignores !== reported) fail(`the summary does not add up: ${summaryLine}`)

for (const c of cases) {
  if (!OUTCOMES.includes(c.outcome)) fail(`${c.name} has the outcome ${c.outcome}, which this script does not know`)
}
for (const c of cases.filter((c) => c.outcome === 'Ignore')) console.log(`ignored: ${c.name}`)

const bad = cases.filter((c) => c.outcome === 'Failure' || c.outcome === 'Error')
for (const c of bad) console.log(`${c.outcome}: ${c.name}`)
if (bad.length > 0) fail(`${String(bad.length)} of ${String(reported)} cases did not succeed`)
if (passes === 0) fail('every case was skipped, so nothing was verified')
