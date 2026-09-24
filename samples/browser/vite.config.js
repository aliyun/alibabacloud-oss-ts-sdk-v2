import { defineConfig } from 'vite'

// The SDK is a linked (`file:`) dependency. Force Vite to pre-bundle it with esbuild so the
// package.json `browser` field swaps in the browser transport; linked deps are otherwise served raw
// in dev, where that swap may not fire and the node transport would leak in.
export default defineConfig({
  optimizeDeps: { include: ['@alicloud/oss-v2'] },
})
