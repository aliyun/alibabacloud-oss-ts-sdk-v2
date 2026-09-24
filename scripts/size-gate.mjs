import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

const MAX_MINIFIED = 42_000
const MAX_GZIPPED = 14_000

const MUST_APPEAR = 'OSS4-HMAC-SHA256'

const MUST_NOT_APPEAR = 'ListBucketResult'

// Bundle source with the browser runtime variants.
/** @type {import('esbuild').Plugin} */
const browserPlatformVariants = {
  name: 'browser-platform-variants',
  setup(plugin) {
    plugin.onResolve({ filter: /\/runtime\/default-transport\.js$/ }, () => ({
      path: fileURLToPath(new URL('../src/runtime/default-transport.browser.ts', import.meta.url)),
    }))
    plugin.onResolve({ filter: /\/runtime\/text-codec\.js$/ }, () => ({
      path: fileURLToPath(new URL('../src/runtime/text-codec.browser.ts', import.meta.url)),
    }))
    plugin.onResolve({ filter: /\/runtime\/mime-type\.js$/ }, () => ({
      path: fileURLToPath(new URL('../src/runtime/mime-type.browser.ts', import.meta.url)),
    }))
    plugin.onResolve({ filter: /\/runtime\/client-extensions\.js$/ }, () => ({
      path: fileURLToPath(new URL('../src/runtime/client-extensions.browser.ts', import.meta.url)),
    }))
  },
}

const result = await build({
  entryPoints: ['scripts/fixtures/size-entry.ts'],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  write: false,
  plugins: [browserPlatformVariants],
})

if (result.outputFiles.length !== 1) {
  console.error(`size gate FAILED: expected 1 output file, got ${String(result.outputFiles.length)}`)
  process.exit(1)
}

const output = result.outputFiles[0].contents
const minified = output.byteLength
const gzipped = gzipSync(output).byteLength
const text = Buffer.from(output).toString('utf8')

const report = `minified ${String(minified)} B (max ${String(MAX_MINIFIED)}), gzipped ${String(gzipped)} B (max ${String(MAX_GZIPPED)})`

const failures = []

if (!text.includes(MUST_APPEAR)) {
  failures.push(
    `the bundle does not contain the string \`${MUST_APPEAR}\`, which means the SDK's signing path ` +
      'is absent -- this run measured nothing, so the byte counts above are meaningless',
  )
}

if (minified > MAX_MINIFIED) {
  failures.push(`minified ${String(minified)} B exceeds ${String(MAX_MINIFIED)} B by ${String(minified - MAX_MINIFIED)} B`)
}

if (gzipped > MAX_GZIPPED) {
  failures.push(`gzipped ${String(gzipped)} B exceeds ${String(MAX_GZIPPED)} B by ${String(gzipped - MAX_GZIPPED)} B`)
}

if (text.includes(MUST_NOT_APPEAR)) {
  failures.push(
    `the bundle contains the string \`${MUST_NOT_APPEAR}\`, which means \`ListObjectsV2\`'s deserializer ` +
      'survived into a bundle that only uses `PutObject` -- tree-shaking is broken regardless of what ' +
      'the byte count says',
  )
}

if (failures.length > 0) {
  console.error(`size gate FAILED: ${report}`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`size gate ok: ${report}`)
