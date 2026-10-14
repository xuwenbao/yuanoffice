import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = __dirname

export default defineConfig({
  root: resolve(root, 'src/renderer'),
  base: '/app/sheets/',
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@host', replacement: resolve(root, 'src/renderer/host-web.ts') },
      {
        find: 'sheets-electron-platform',
        replacement: resolve(root, 'src/renderer/platform-electron.web.ts'),
      },
      // Relative imports resolve for unit tests and tsc. The web bundle
      // replaces the desktop adapter so it is not shipped. The pattern matches
      // the whole specifier: Vite replaces only the matched text, and a suffix
      // match turns "./platform-electron" into a broken "./<abs>" path.
      {
        find: /^(?:.*[/\\])?platform-electron(?:\.ts)?$/,
        replacement: resolve(root, 'src/renderer/platform-electron.web.ts'),
      },
      {
        find: '@genoffice/platform-web',
        replacement: resolve(root, '../../packages/platform-web/src/index.ts'),
      },
      {
        find: '@genoffice/platform',
        replacement: resolve(root, '../../packages/platform/src/index.ts'),
      },
    ],
  },
  build: {
    outDir: resolve(root, '../../dist/web/app/sheets'),
    emptyOutDir: true,
  },
  server: { port: 5184, strictPort: true },
})
