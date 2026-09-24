import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { normalizePath } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Non-embedded CMaps/standard fonts (e.g. CJK) need pdfjs data dirs, shipped with renderer output
const pdfRoot = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const pdfjsRoot = dirname(dirname(require.resolve('pdfjs-dist/package.json')))
// vite-plugin-static-copy globs require POSIX separators; join() breaks on Windows
const pdfjsDir = (sub: string) => normalizePath(join(pdfjsRoot, 'pdfjs-dist', sub))

export default defineConfig({
  // @genoffice/i18n ships as TS source; pdf-lib's package only includes out/** — both must be bundled
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@genoffice/i18n',
          'pdf-lib',
          '@genoffice/electron-utils',
          '@genoffice/font-metrics',
        ],
      }),
    ],
  },
  preload: {
    // i18n and electron-utils ship as TS source — must be bundled, not left external
    plugins: [externalizeDepsPlugin({ exclude: ['@genoffice/i18n', '@genoffice/electron-utils'] })],
  },
  renderer: {
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
        '@host': join(pdfRoot, 'src/renderer/host-electron.ts'),
        '@genoffice/platform': join(pdfRoot, '../../packages/platform/src/index.ts'),
      },
    },
    server: {
      port: Number(process.env.PDF_DEV_PORT) || 5176,
      strictPort: Boolean(process.env.PDF_DEV_PORT),
    },
  },
})
