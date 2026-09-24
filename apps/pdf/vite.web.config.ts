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
    alias: {
      '@host': resolve(root, 'src/renderer/host-web.ts'),
      'pdf-electron-platform': resolve(root, 'src/renderer/platform-electron.web.ts'),
      '@genoffice/platform': resolve(root, '../../packages/platform/src/index.ts'),
      '@genoffice/platform-web': resolve(root, '../../packages/platform-web/src/index.ts'),
    },
  },
  build: {
    outDir: resolve(root, '../../dist/web/app/pdf'),
    emptyOutDir: true,
  },
  server: { port: 5186, strictPort: true },
})
