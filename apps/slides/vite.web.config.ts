import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = __dirname

export default defineConfig({
  root: resolve(root, 'src/renderer'),
  base: '/app/slides/',
  resolve: {
    alias: {
      '@host': resolve(root, 'src/renderer/host-web.ts'),
      '@genoffice/platform': resolve(root, '../../packages/platform/src/index.ts'),
      '@genoffice/platform-web': resolve(root, '../../packages/platform-web/src/index.ts'),
    },
  },
  build: {
    outDir: resolve(root, '../../dist/web/app/slides'),
    emptyOutDir: true,
    rollupOptions: { input: { index: resolve(root, 'src/renderer/web.html') } },
  },
  server: { port: 5185, strictPort: true },
})
