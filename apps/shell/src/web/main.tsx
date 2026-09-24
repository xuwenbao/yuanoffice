import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ControlLink,
  DraftStore,
  ServiceFiles,
  installFrameHost,
  type FileEntry,
} from '@genoffice/platform-web'
import '@genoffice/ui/tokens.css'
import { shellLang, shellStrings } from './i18n'
import type { zh } from './i18n/zh'
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
  const [dir, setDir] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<Tab | null>(null)
  const [recovered, setRecovered] = useState<string[]>([])

  useEffect(() => {
    void fetch('/api/session', { credentials: 'same-origin' })
    const link = new ControlLink(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`, '')
    link.start('shell')
    link.onOpen((path, editorId) => openPath(path, editorId))
    link.onFocus((editorId) => setActive(editorId))
    const host = installFrameHost(location.origin)
    host.onMessage((message) => {
      if (message.kind === 'doc-state') {
        setTabs((current) =>
          current.map((tab) =>
            tab.id === message.frameId ? { ...tab, title: message.title, dirty: message.dirty, path: message.path } : tab,
          ),
        )
      }
    })
    void drafts.list().then((records) => setRecovered(records.map((record) => record.path))).catch(() => {})
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

  async function browse(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setEntries(await files.list(dir))
  }

  function askClose(tab: Tab): void {
    if (!tab.dirty) {
      setTabs((current) => current.filter((item) => item.id !== tab.id))
      return
    }
    setPrompt(tab)
  }

  return (
    <div className="shell">
      <aside className="home">
        <h1>{t('home')}</h1>
        <form onSubmit={(event) => void browse(event)}>
          <input value={dir} onChange={(event) => setDir(event.target.value)} spellCheck={false} />
          <button type="submit">{t('browse')}</button>
        </form>
        <ul className="files">
          {entries.length === 0 ? <li>{t('empty')}</li> : null}
          {entries.map((entry) => (
            <li key={entry.path}>
              <button
                type="button"
                onClick={() => {
                  if (entry.kind === 'dir') {
                    setDir(entry.path)
                    void files.list(entry.path).then(setEntries)
                  } else openPath(entry.path)
                }}
              >
                {entry.kind === 'dir' ? `${entry.name}/` : entry.name}
              </button>
            </li>
          ))}
        </ul>
        {recovered.length > 0 ? (
          <ul className="files">
            {recovered.map((path) => (
              <li key={path}>
                <button type="button" onClick={() => openPath(path)}>
                  {path}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </aside>
      <section className="stage">
        <div className="tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={tab.editorId === active ? 'active' : ''}
              onClick={() => setActive(tab.editorId)}
            >
              {tab.title}
              {tab.dirty ? ` (${t('dirty')})` : ''}
              <span
                onClick={(event) => {
                  event.stopPropagation()
                  askClose(tab)
                }}
              >
                {' '}
                {t('close')}
              </span>
            </button>
          ))}
        </div>
        <div className="frames">
          {tabs.map((tab) => (
            <iframe
              key={tab.id}
              data-frame={tab.id}
              className={tab.editorId === active ? '' : 'back'}
              title={tab.title}
              src={`/app/${tab.kind}/${tab.kind === 'docs' ? 'index.html' : 'web.html'}?path=${encodeURIComponent(tab.path)}&editorId=${encodeURIComponent(tab.editorId)}&shellFrame=${encodeURIComponent(tab.id)}`}
            />
          ))}
        </div>
      </section>
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
                setPrompt(null)
              }}
            >
              {t('save')}
            </button>
            <button
              type="button"
              onClick={() => {
                void drafts.put({ path: prompt.path, updatedAt: Date.now(), bytes: new ArrayBuffer(0) })
                setTabs((current) => current.filter((tab) => tab.id !== prompt.id))
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
