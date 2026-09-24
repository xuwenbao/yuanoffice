import type { LanguagePort } from '@genoffice/platform'

const KEY = 'genoffice.language'

export function browserLanguagePort(fallback = 'zh'): LanguagePort {
  const listeners = new Set<(language: string) => void>()
  return {
    async get() {
      return localStorage.getItem(KEY) || fallback
    },
    async set(language: string) {
      localStorage.setItem(KEY, language)
      for (const listener of listeners) listener(language)
    },
    onChanged(handler) {
      listeners.add(handler)
      return () => listeners.delete(handler)
    },
  }
}
