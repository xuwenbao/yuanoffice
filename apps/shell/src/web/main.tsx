import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ControlLink, DraftStore, ServiceFiles, installFrameHost } from '@genoffice/platform-web'
import '@genoffice/ui/tokens.css'
import '../renderer/src/home.css'
import { shellLang, shellStrings } from './i18n'
import type { zh } from './i18n/zh'
import { HomeView } from './HomeView'
import { loadLibrary, remember, saveLibrary, type LibraryRecord } from './library'
import './styles.css'
import { editorKind, type WebTab } from './tabs'

interface Tab extends WebTab {
  kind: 'docs' | 'pdf' | 'slides' | 'sheets'
  dirty: boolean
}

const lang = shellLang()
const t = (key: keyof typeof zh) => shellStrings(lang, key)

function Shell() {
  const files = useMemo(() => new ServiceFiles(''), [])
  const drafts = useMemo(() => new DraftStore(), [])
  const [ready, setReady] = useState(false)
  const [library, setLibrary] = useState<LibraryRecord[]>(() => loadLibrary())
  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<Tab | null>(null)

  function updateLibrary(next: LibraryRecord[]): void {
    saveLibrary(next)
    setLibrary(next)
  }

  function noteOpened(path: string): void {
    setLibrary((current) => {
      const next = remember(current, path, Date.now())
      saveLibrary(next)
      return next
    })
  }

  useEffect(() => {
    void fetch('/api/session', { credentials: 'same-origin' })
      .then(() => setReady(true))
      .catch(() => setReady(true))
    const link = new ControlLink(
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
      '',
    )
    link.start('shell')
    link.onOpen((path, editorId) => openPath(path, editorId))
    link.onFocus((editorId) => setActive(editorId))
    const host = installFrameHost(location.origin)
    host.onMessage((message) => {
      if (message.kind === 'doc-state') {
        setTabs((current) =>
          current.map((tab) =>
            tab.id === message.frameId
              ? {
                  ...tab,
                  title: message.title || tab.title,
                  dirty: message.dirty,
                  // An empty path is an untitled draft. Replacing the iframe src
                  // with it reloads the page and drops the file that was open.
                  path: message.path || tab.path,
                }
              : tab,
          ),
        )
      }
    })
    void drafts
      .list()
      .then((records) => {
        setLibrary((current) => {
          let next = current
          for (const record of records) next = remember(next, record.path, record.updatedAt)
          saveLibrary(next)
          return next
        })
      })
      .catch(() => {})
    const onFrame = (event: Event): void => {
      const iframe = event.target
      if (!(iframe instanceof HTMLIFrameElement) || !iframe.dataset.frame) return
      if (iframe.contentWindow) host.register(iframe.dataset.frame, iframe.contentWindow)
    }
    document.addEventListener('load', onFrame, true)
    const onLeave = (event: BeforeUnloadEvent): void => {
      if (!tabs.some((tab) => tab.dirty)) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onLeave)
    return () => {
      link.stop()
      host.stop()
      document.removeEventListener('load', onFrame, true)
      window.removeEventListener('beforeunload', onLeave)
    }
    // openPath is stable enough for the session; tabs are read at unload time via the listener closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openPath(path: string, editorId = crypto.randomUUID().slice(0, 12)): void {
    const kind = editorKind(path)
    if (!kind) return
    noteOpened(path)
    setTabs((current) => {
      const existing = current.find((tab) => tab.path === path || tab.editorId === editorId)
      if (existing) {
        setActive(existing.editorId)
        return current
      }
      const tab: Tab = {
        id: crypto.randomUUID(),
        editorId,
        path,
        title: path.split(/[/\\]/).pop() || path,
        kind,
        dirty: false,
      }
      setActive(tab.editorId)
      return [...current, tab]
    })
  }

  function askClose(tab: Tab): void {
    if (!tab.dirty) {
      setTabs((current) => current.filter((item) => item.id !== tab.id))
      if (active === tab.editorId) setActive(null)
      return
    }
    setPrompt(tab)
  }

  return (
    <div className="app">
      <header className="web-tabs">
        <button type="button" className={active ? '' : 'active'} onClick={() => setActive(null)}>
          {t('home')}
        </button>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.editorId === active ? 'active' : ''}
            onClick={() => setActive(tab.editorId)}
          >
            <span className="web-tab-title">
              {tab.title}
              {tab.dirty ? ` (${t('dirty')})` : ''}
            </span>
            <span
              className="web-tab-close"
              onClick={(event) => {
                event.stopPropagation()
                askClose(tab)
              }}
            >
              {t('close')}
            </span>
          </button>
        ))}
      </header>
      <div className="web-stage">
        <div className={active ? 'back' : ''}>
          {ready ? (
            <HomeView files={files} library={library} onLibrary={updateLibrary} onOpen={openPath} />
          ) : null}
        </div>
        <div className={`frames${active ? '' : ' back'}`}>
          {tabs.map((tab) => (
            <iframe
              key={tab.id}
              data-frame={tab.id}
              className={tab.editorId === active ? '' : 'back'}
              title={tab.title}
              src={`/app/${tab.kind}/index.html?path=${encodeURIComponent(tab.path)}&editorId=${encodeURIComponent(tab.editorId)}&shellFrame=${encodeURIComponent(tab.id)}`}
            />
          ))}
        </div>
      </div>
      {prompt ? (
        <div className="dialog">
          <form
            onSubmit={(event) => {
              event.preventDefault()
            }}
          >
            <p>{t('unsaved')}</p>
            <button
              type="button"
              onClick={() => {
                const frame = document.querySelector(`iframe[data-frame="${prompt.id}"]`)
                if (frame instanceof HTMLIFrameElement && frame.contentWindow) {
                  frame.contentWindow.postMessage(
                    {
                      protocol: 'genoffice.shell.frame.v1',
                      kind: 'close-save',
                      requestId: crypto.randomUUID(),
                    },
                    location.origin,
                  )
                }
                setTabs((current) => current.filter((tab) => tab.id !== prompt.id))
                if (active === prompt.editorId) setActive(null)
                setPrompt(null)
              }}
            >
              {t('save')}
            </button>
            <button
              type="button"
              onClick={() => {
                void drafts.put({
                  path: prompt.path,
                  updatedAt: Date.now(),
                  bytes: new ArrayBuffer(0),
                })
                setTabs((current) => current.filter((tab) => tab.id !== prompt.id))
                if (active === prompt.editorId) setActive(null)
                setPrompt(null)
              }}
            >
              {t('discard')}
            </button>
            <button type="button" onClick={() => setPrompt(null)}>
              {t('cancel')}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Shell />)
