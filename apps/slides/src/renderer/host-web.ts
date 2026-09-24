import { setSlidesPlatform } from './platform'
import type { SlidesApi } from '../shared/ipc'

export async function installSlidesHost(): Promise<void> {
  await fetch('/api/session', { credentials: 'same-origin' })
  setSlidesPlatform({
    api: new Proxy({} as SlidesApi, {
      get(_target, prop) {
        if (prop === 'getLanguage') return async () => 'zh'
        if (prop === 'getTheme') return async () => 'system'
        if (typeof prop === 'string' && prop.startsWith('on')) return () => () => {}
        return () => Promise.reject(new Error(`slides web host has no ${String(prop)}`))
      },
    }),
    ai: null,
    agentControl: null,
  })
}
