import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = __dirname

const workspaceAlias = {
  '@genoffice/pptx-engine/table-grid': resolve(
    root,
    '../../packages/pptx-engine/src/table-grid.ts',
  ),
  '@genoffice/pptx-engine/identity': resolve(root, '../../packages/pptx-engine/src/identity.ts'),
  '@genoffice/pptx-engine/named-action': resolve(
    root,
    '../../packages/pptx-engine/src/named-action.ts',
  ),
  '@genoffice/pptx-engine/custgeom': resolve(root, '../../packages/pptx-engine/src/custgeom.ts'),
  '@genoffice/pptx-engine/background-promote': resolve(
    root,
    '../../packages/pptx-engine/src/background-promote.ts',
  ),
  '@genoffice/pptx-engine': resolve(root, '../../packages/pptx-engine/src/index.ts'),
  '@genoffice/pptx-ops/op-docs': resolve(root, '../../packages/pptx-ops/src/op-docs.ts'),
  '@genoffice/pptx-ops/font-size': resolve(root, '../../packages/pptx-ops/src/font-size.ts'),
  '@genoffice/pptx-ops': resolve(root, '../../packages/pptx-ops/src/index.ts'),
  '@genoffice/pptx-render/preset-geometry': resolve(
    root,
    '../../packages/pptx-render/src/preset-geometry.ts',
  ),
  '@genoffice/pptx-render': resolve(root, '../../packages/pptx-render/src/index.ts'),
  '@genoffice/pipelines/slides/layout-audit': resolve(
    root,
    '../../packages/pipelines/src/slides/layout-audit.ts',
  ),
  '@genoffice/pipelines/slides': resolve(root, '../../packages/pipelines/src/slides/index.ts'),
  '@genoffice/docx-engine/metafile': resolve(root, '../../packages/docx-engine/src/metafile.ts'),
  '@genoffice/docx-engine/math': resolve(root, '../../packages/docx-engine/src/math.ts'),
  'node:zlib': resolve(root, 'src/renderer/shims/node-zlib.ts'),
}

export default defineConfig({
  root: resolve(root, 'src/renderer'),
  base: '/app/slides/',
  plugins: [react()],
  resolve: {
    alias: {
      ...workspaceAlias,
      '@host': resolve(root, 'src/renderer/host-web.ts'),
      'slides-electron-platform': resolve(root, 'src/renderer/platform-electron.web.ts'),
      '@genoffice/platform': resolve(root, '../../packages/platform/src/index.ts'),
      '@genoffice/platform-web': resolve(root, '../../packages/platform-web/src/index.ts'),
    },
  },
  build: {
    outDir: resolve(root, '../../dist/web/app/slides'),
    emptyOutDir: true,
  },
  server: { port: 5185, strictPort: true },
})
