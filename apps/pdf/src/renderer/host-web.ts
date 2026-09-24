import { setPdfPlatform } from './platform'
import type { PdfApi } from '../shared/ipc'

/** Browser entry. The live page is web-main.ts; this keeps @host resolvable. */
export async function installPdfHost(): Promise<void> {
  await fetch('/api/session', { credentials: 'same-origin' })
  setPdfPlatform({
    api: new Proxy({} as PdfApi, {
      get(_target, prop) {
        if (prop === 'getLanguage') return async () => 'zh'
        if (prop === 'getTheme') return async () => 'system'
        if (typeof prop === 'string' && prop.startsWith('on')) return () => () => {}
        return () => Promise.reject(new Error(`pdf web host has no ${String(prop)}`))
      },
    }),
    ai: null,
    agentControl: null,
  })
}
