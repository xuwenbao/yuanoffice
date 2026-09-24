import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, normalizePath } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const root = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const pdfjsRoot = dirname(dirname(require.resolve('pdfjs-dist/package.json')))
const pdfjsDir = (sub: string) => normalizePath(join(pdfjsRoot, 'pdfjs-dist', sub))

export default defineConfig({
  root: resolve(root, 'src/renderer'),
  base: '/app/pdf/',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: pdfjsDir('cmaps'), dest: 'pdfjs' },
        { src: pdfjsDir('standard_fonts'), dest: 'pdfjs' },
        { src: pdfjsDir('wasm'), dest: 'pdfjs' },
      ],
    }),
  ],
  resolve: {
    alias: [
      { find: '@host', replacement: resolve(root, 'src/renderer/host-web.ts') },
      {
        find: 'pdf-electron-platform',
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
    outDir: resolve(root, '../../dist/web/app/pdf'),
    emptyOutDir: true,
  },
  server: { port: 5186, strictPort: true },
})
