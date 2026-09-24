import { fileURLToPath } from 'node:url'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, type Plugin } from 'vitest/config'

function slowEndpoint(): Plugin {
  return {
    name: 'oss-slow-endpoint',
    configureServer(server) {
      server.middlewares.use('/__slow', (req, res) => {
        const timer = setTimeout(() => {
          res.writeHead(204)
          res.end()
        }, 30_000)
        req.on('close', () => {
          clearTimeout(timer)
        })
      })
    },
  }
}

// Map runtime imports to their browser variants.
function browserPlatformVariants(): Plugin {
  const transport = fileURLToPath(new URL('src/runtime/default-transport.browser.ts', import.meta.url))
  const clientExtensions = fileURLToPath(new URL('src/runtime/client-extensions.browser.ts', import.meta.url))
  const codec = fileURLToPath(new URL('src/runtime/text-codec.browser.ts', import.meta.url))
  const mimeType = fileURLToPath(new URL('src/runtime/mime-type.browser.ts', import.meta.url))
  return {
    name: 'oss-browser-platform-variants',
    enforce: 'pre',
    resolveId(source) {
      if (source.endsWith('/runtime/default-transport.js')) return transport
      if (source.endsWith('/runtime/client-extensions.js')) return clientExtensions
      if (source.endsWith('/runtime/text-codec.js')) return codec
      if (source.endsWith('/runtime/mime-type.js')) return mimeType
      return null
    },
  }
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          // `@ohos.net.http` resolves only on a device.
          alias: { '@ohos.net.http': fileURLToPath(new URL('tests/fixtures/ohos-net-http.ts', import.meta.url)) },
          env: { TZ: 'Asia/Shanghai' },
        },
      },
      {
        plugins: [slowEndpoint(), browserPlatformVariants()],
        // A local run needs `npx playwright install chromium`; CI provides the binary.
        test: {
          name: 'browser',
          include: ['tests/unit/**/*.test.ts', 'tests/browser/**/*.test.ts'],
          exclude: [
            'tests/unit/runtime/**',
            'tests/unit/index.test.ts',
            'tests/unit/lint-gate.test.ts',
            'tests/unit/utils/sha1.test.ts',
            'tests/unit/utils/sha256.test.ts',
            'tests/unit/utils/user-agent.test.ts',
          ],
          browser: {
            enabled: true,
            // Vitest 4 takes a provider factory, not the name `'playwright'`.
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
