import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = __dirname

export default defineConfig({
  root: resolve(root, 'src/renderer'),
  base: '/app/docs/',
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@host', replacement: resolve(root, 'src/renderer/host-web.ts') },
      {
        find: '@genoffice/platform-web',
        replacement: resolve(root, '../../packages/platform-web/src/index.ts'),
      },
      {
        find: '@genoffice/platform',
        replacement: resolve(root, '../../packages/platform/src/index.ts'),
      },
      {
        find: 'docs-electron-platform',
        replacement: resolve(root, 'src/renderer/platform-electron.web.ts'),
      },
      // Relative imports of the desktop adapter stay on the real file for CLI
      // tests and tsc. The web bundle must not ship that module.
      {
        find: /(?:^|[/\\])platform-electron\.ts$/,
        replacement: resolve(root, 'src/renderer/platform-electron.web.ts'),
      },
      {
        find: '@genoffice/docx-engine/lazy-media',
        replacement: resolve(root, '../../packages/docx-engine/src/lazy-media.ts'),
      },
      {
        find: '@genoffice/docx-engine',
        replacement: resolve(root, '../../packages/docx-engine/src/index.ts'),
      },
    ],
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
