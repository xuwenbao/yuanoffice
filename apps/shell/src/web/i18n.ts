import { createI18n, type Lang } from '@genoffice/i18n'
import { strings } from './i18n/strings'

export const shellStrings = createI18n(strings)

export function shellLang(): Lang {
  const stored = localStorage.getItem('genoffice.language')
  if (stored && stored in strings) return stored as Lang
  return 'zh'
}
