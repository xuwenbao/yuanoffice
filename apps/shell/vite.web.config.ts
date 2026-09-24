import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = __dirname

export default defineConfig({
  root: resolve(root, 'src/web'),
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@genoffice/platform': resolve(root, '../../packages/platform/src/index.ts'),
      '@genoffice/platform-web': resolve(root, '../../packages/platform-web/src/index.ts'),
      '@genoffice/i18n': resolve(root, '../../packages/i18n/src/index.ts'),
      '@genoffice/ui/tokens.css': resolve(root, '../../packages/ui/src/tokens.css'),
    },
  },
  build: {
    outDir: resolve(root, '../../dist/web'),
    emptyOutDir: false,
  },
  server: { port: 5180, strictPort: true },
})
