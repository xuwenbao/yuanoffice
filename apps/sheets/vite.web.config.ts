import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = __dirname

export default defineConfig({
  root: resolve(root, 'src/renderer'),
  base: '/app/sheets/',
  plugins: [react()],
  resolve: {
    alias: {
      '@host': resolve(root, 'src/renderer/host-web.ts'),
      'sheets-electron-platform': resolve(root, 'src/renderer/platform-electron.web.ts'),
      '@genoffice/platform': resolve(root, '../../packages/platform/src/index.ts'),
      '@genoffice/platform-web': resolve(root, '../../packages/platform-web/src/index.ts'),
    },
  },
  build: {
    outDir: resolve(root, '../../dist/web/app/sheets'),
    emptyOutDir: true,
  },
  server: { port: 5184, strictPort: true },
})
