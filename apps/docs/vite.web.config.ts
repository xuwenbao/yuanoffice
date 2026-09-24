import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = __dirname

export default defineConfig({
  root: resolve(root, 'src/renderer'),
  base: '/app/docs/',
  plugins: [react()],
  resolve: {
    alias: {
      '@host': resolve(root, 'src/renderer/host-web.ts'),
      '@genoffice/platform': resolve(root, '../../packages/platform/src/index.ts'),
      '@genoffice/platform-web': resolve(root, '../../packages/platform-web/src/index.ts'),
      'docs-electron-platform': resolve(root, 'src/renderer/platform-electron.web.ts'),
      '@genoffice/docx-engine/lazy-media': resolve(
        root,
        '../../packages/docx-engine/src/lazy-media.ts',
      ),
      '@genoffice/docx-engine': resolve(root, '../../packages/docx-engine/src/index.ts'),
    },
  },
  build: {
    outDir: resolve(root, '../../dist/web/app/docs'),
    emptyOutDir: true,
  },
  server: {
    port: Number(process.env.DOCS_WEB_PORT) || 5183,
    strictPort: true,
  },
})
