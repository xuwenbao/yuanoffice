import { installDocsHost } from '@host'
import { docsPlatform } from './platform'
import { createRoot } from 'react-dom/client'
import { htmlLang, type Lang } from '@genoffice/i18n'
import { App } from './App'
import { LocaleProvider, setModuleLang } from './i18n/locale'
import type { UiTheme } from '../shared/ipc'
import '@genoffice/ui/tokens.css'
import '@genoffice/ui/screentip.css'
import '@genoffice/ui/color-picker.css'
import '@genoffice/ui/dropdown.css'
import '@genoffice/ui/ribbon-collapse.css'
import '@genoffice/ui/markdown.css'
import '@genoffice/ui/ai-panel-prefs.css'
import '@genoffice/ui/ai-scope-quote.css'
import '@genoffice/ui/image-viewer.css'
import './styles.css'
import './fonts/fonts.css'
import { applyAiPanelPrefs, installScreenTips } from '@genoffice/ui'
import { setAltChunkHtmlConverter } from '@genoffice/docx-engine'

installScreenTips()

function applyTheme(theme: UiTheme): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

async function bootstrap(): Promise<void> {
  await installDocsHost()
  if (docsPlatform().api.convertAltChunkHtml) {
    setAltChunkHtmlConverter((html) => docsPlatform().api.convertAltChunkHtml(html))
  }
  let lang: Lang = 'zh'
  let theme: UiTheme = 'system'
  try {
    // per-promise catch: standalone runs have no app:get-theme handler, and
    // that rejection must not drop a resolved language
    ;[lang, theme] = await Promise.all([
      docsPlatform()
        .api.getLanguage()
        .catch(() => 'zh' as const),
      docsPlatform()
        .api.getTheme()
        .catch(() => 'system' as const),
    ])
  } catch {
    /* dev renderer without the preload bridge */
  }
  setModuleLang(lang)
  document.documentElement.lang = htmlLang(lang)
  applyTheme(theme)
  docsPlatform().api?.onThemeChanged(applyTheme)
  void docsPlatform()
    .api?.getAiPanelPrefs?.()
    .then(applyAiPanelPrefs)
    .catch(() => {})
  docsPlatform().api?.onAiPanelPrefsChanged?.(applyAiPanelPrefs)
  createRoot(document.getElementById('root')!).render(
    <LocaleProvider initial={lang}>
      <App />
    </LocaleProvider>,
  )
}

void bootstrap()
