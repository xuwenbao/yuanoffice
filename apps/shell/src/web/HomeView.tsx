import { useEffect, useMemo, useState } from 'react'
import { createI18n, type Lang } from '@genoffice/i18n'
import type { FileEntry, ServiceFiles } from '@genoffice/platform-web'
import logoLockup from '../renderer/src/assets/genoffice-logo.svg'
import iconDocx from '../renderer/src/assets/file-docx.svg'
import iconXlsx from '../renderer/src/assets/file-xlsx.svg'
import iconPptx from '../renderer/src/assets/file-pptx.svg'
import iconPdf from '../renderer/src/assets/file-pdf.svg'
import { strings } from '../renderer/src/strings'
import { shellLang, shellStrings } from './i18n'
import type { zh } from './i18n/zh'
import {
  dropRecords,
  extensionOf,
  matchesExt,
  matchesQuery,
  nextFileName,
  parentName,
  toggleStar,
  type LibraryRecord,
} from './library'

const translate = createI18n(strings)
type HomeKey = keyof typeof strings.zh
const lang = shellLang()
const t = (key: HomeKey, params?: Record<string, string | number>) => translate(lang, key, params)
const tw = (key: keyof typeof zh) => shellStrings(lang, key)

const ICONS: Record<string, string> = {
  docx: iconDocx,
  xlsx: iconXlsx,
  pptx: iconPptx,
  pdf: iconPdf,
}
const FILTERS: { key: string; label: HomeKey }[] = [
  { key: 'all', label: 'filterAll' },
  { key: 'docx', label: 'filterDocs' },
  { key: 'xlsx', label: 'filterSheets' },
  { key: 'pptx', label: 'filterSlides' },
  { key: 'pdf', label: 'filterPdf' },
]
const NEW_ITEMS: { ext: 'docx' | 'xlsx' | 'pptx' | 'pdf'; title: HomeKey }[] = [
  { ext: 'docx', title: 'newDoc' },
  { ext: 'xlsx', title: 'newSheet' },
  { ext: 'pptx', title: 'newSlide' },
  { ext: 'pdf', title: 'newPdf' },
]
const GREET_ASK: HomeKey[] = [
  'greetAsk1',
  'greetAsk2',
  'greetAsk3',
  'greetAsk4',
  'greetAsk5',
  'greetAsk6',
]

interface ListedFile {
  path: string
  name: string
  location: string
  mtimeMs: number
  sizeBytes: number
  missing: boolean
  starred: boolean
}

export function HomeView({
  files,
  library,
  onLibrary,
  onOpen,
}: {
  files: ServiceFiles
  library: LibraryRecord[]
  onLibrary: (next: LibraryRecord[]) => void
  onOpen: (path: string) => void
}) {
  const [roots, setRoots] = useState<FileEntry[]>([])
  const [children, setChildren] = useState<Record<string, FileEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [folder, setFolder] = useState<string | null>(null)
  const [listing, setListing] = useState<FileEntry[]>([])
  const [stats, setStats] = useState<Record<string, FileEntry | null>>({})
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [ask] = useState(
    () => GREET_ASK[Math.floor(Math.random() * GREET_ASK.length)] ?? 'greetAsk1',
  )

  useEffect(() => {
    let alive = true
    void files
      .list('')
      .then((entries) => {
        if (!alive) return
        setRoots(entries)
        if (entries[0]) void loadChildren(entries[0].path)
      })
      .catch((error: unknown) => {
        if (alive) setNotice(error instanceof Error ? error.message : tw('failed'))
      })
    return () => {
      alive = false
    }
    // loadChildren is recreated each render; the root list is fetched once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files])

  useEffect(() => {
    if (!folder) return
    let alive = true
    void files
      .list(folder)
      .then((entries) => {
        if (alive) setListing(entries)
      })
      .catch((error: unknown) => {
        if (alive) setNotice(error instanceof Error ? error.message : tw('failed'))
      })
    return () => {
      alive = false
    }
  }, [files, folder])

  useEffect(() => {
    let alive = true
    void Promise.all(
      library.map(async (record) => {
        try {
          return [record.path, await files.stat(record.path)] as const
        } catch {
          return [record.path, null] as const
        }
      }),
    ).then((pairs) => {
      if (!alive) return
      setStats(Object.fromEntries(pairs))
    })
    return () => {
      alive = false
    }
  }, [files, library])

  async function loadChildren(path: string): Promise<void> {
    const entries = await files.list(path)
    setChildren((current) => ({
      ...current,
      [path]: entries.filter((entry) => entry.kind === 'dir'),
    }))
    setExpanded((current) => new Set([...current, path]))
  }

  function selectFolder(path: string): void {
    setFolder(path)
    setNotice('')
    if (filter === 'starred') setFilter('all')
    if (!expanded.has(path)) void loadChildren(path).catch(() => {})
  }

  async function create(ext: 'docx' | 'xlsx' | 'pptx' | 'pdf'): Promise<void> {
    const dir = folder ?? roots[0]?.path
    if (!dir) return
    setBusy(true)
    setNotice('')
    try {
      const existing = (folder === dir ? listing : await files.list(dir)).map((entry) => entry.name)
      const created = await files.create(dir, nextFileName(existing, t('untitled'), ext))
      if (folder === dir) setListing(await files.list(dir))
      onOpen(created.path)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : tw('failed'))
    } finally {
      setBusy(false)
    }
  }

  const recentRows = useMemo(() => rowsFromLibrary(library, stats, false), [library, stats])
  const starredRows = useMemo(() => rowsFromLibrary(library, stats, true), [library, stats])
  const folderRows = useMemo(() => {
    const filesOnly = listing.filter((entry) => entry.kind === 'file')
    return filesOnly
      .filter(
        (entry) =>
          matchesExt(entry.name, filter) && matchesQuery(entry.name, parentName(entry.path), query),
      )
      .map((entry) => toListed(entry, library))
  }, [listing, filter, query, library])
  const foldersHere = listing.filter(
    (entry) => entry.kind === 'dir' && matchesQuery(entry.name, parentName(entry.path), query),
  )
  const rows = (folder ? folderRows : filter === 'starred' ? starredRows : recentRows).filter(
    (row) =>
      matchesExt(row.name, filter === 'starred' ? 'all' : filter) &&
      matchesQuery(row.name, row.location, query),
  )
  const view: 'recent' | 'starred' | 'folder' = folder
    ? 'folder'
    : filter === 'starred'
      ? 'starred'
      : 'recent'

  const hour = new Date().getHours()
  const greetKey: HomeKey =
    hour < 6
      ? 'greetEvening'
      : hour < 12
        ? 'greetMorning'
        : hour < 18
          ? 'greetAfternoon'
          : 'greetEvening'
  const cjk = lang === 'zh' || lang === 'zh-TW' || lang === 'ja'
  const greeting = `${t(greetKey)}${cjk ? '。' : '. '}`

  return (
    <div className="home">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img className="logo-lockup" src={logoLockup} alt="GenOffice" />
        </div>
        <nav className="sidebar-nav">
          <NavButton
            active={!folder && view !== 'starred'}
            label={t('navRecent')}
            count={recentRows.length}
            icon="recent"
            onClick={() => {
              setFolder(null)
              setFilter('all')
            }}
          />
          <NavButton
            active={!folder && view === 'starred'}
            label={t('navStarred')}
            count={starredRows.length}
            icon="star"
            onClick={() => {
              setFolder(null)
              setFilter('starred')
            }}
          />
        </nav>
        <div className="sidebar-divider" />
        <div className="folder-panel">
          <div className="folder-panel-head">
            <span className="folder-panel-title">{t('folders')}</span>
          </div>
          <ul className="tree" role="tree">
            {roots.map((root) => (
              <FolderNode
                key={root.path}
                entry={root}
                depth={0}
                selected={folder}
                expanded={expanded}
                childrenOf={children}
                onSelect={selectFolder}
                onToggle={(path) => {
                  if (expanded.has(path)) {
                    setExpanded((current) => {
                      const next = new Set(current)
                      next.delete(path)
                      return next
                    })
                    return
                  }
                  void loadChildren(path).catch((error: unknown) => {
                    setNotice(error instanceof Error ? error.message : tw('failed'))
                  })
                }}
              />
            ))}
          </ul>
        </div>
      </aside>
      <main className="content">
        <section className="quick-start" aria-label={t('secQuickStart')}>
          <div className="home-hero">
            <h1 className="hero-title">
              {greeting}
              <span className="hero-ask">{t(ask)}</span>
            </h1>
          </div>
          <div className="quick-cards">
            {NEW_ITEMS.map((item) => (
              <button
                key={item.ext}
                className="quick-card"
                type="button"
                disabled={busy}
                onClick={() => void create(item.ext)}
              >
                <img src={ICONS[item.ext]} width={30} height={30} alt="" />
                <span className="quick-text">
                  <span className="quick-title">{t(item.title)}</span>
                  <span className="quick-sub">.{item.ext}</span>
                </span>
              </button>
            ))}
            <button
              className="quick-card"
              type="button"
              onClick={() => {
                if (roots[0]) selectFolder(roots[0].path)
              }}
            >
              <span className="quick-folder">
                <FolderGlyph />
              </span>
              <span className="quick-text">
                <span className="quick-title">{t('openLocal')}</span>
                <span className="quick-sub">.docx / .xlsx / .pptx / .pdf</span>
              </span>
            </button>
          </div>
        </section>
        <section
          className="recents"
          aria-label={folder ? parentName(folder) || folder : t('secRecent')}
        >
          <div className="recents-toolbar">
            <div className="filter-pills" role="tablist">
              {FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`filter-pill${filter === item.key ? ' active' : ''}`}
                  onClick={() => setFilter(item.key)}
                >
                  {t(item.label)}
                </button>
              ))}
            </div>
            <div className="file-search-group">
              <label className="file-search">
                <input
                  value={query}
                  placeholder={t('searchFilesPlaceholder')}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
            <div className="recents-heading">
              <span className="section-label">
                {folder
                  ? folder.split(/[/\\]/).filter(Boolean).pop()
                  : view === 'starred'
                    ? t('secStarred')
                    : t('secRecent')}
              </span>
              <span className="file-count">{rows.length}</span>
            </div>
          </div>
          {notice ? <p className="empty">{`${tw('failed')} (${notice})`}</p> : null}
          {foldersHere.length > 0 ? (
            <ul className="recent-list">
              {foldersHere.map((entry) => (
                <li key={entry.path}>
                  <button
                    className="recent-item folder-item"
                    type="button"
                    onClick={() => selectFolder(entry.path)}
                  >
                    <span className="recent-icon">
                      <FolderGlyph />
                    </span>
                    <span className="recent-name">{entry.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {rows.length === 0 ? (
            <p className="empty">
              <span className="empty-hint">
                {view === 'starred'
                  ? t('emptyStarred')
                  : view === 'folder'
                    ? filter === 'all' && !query
                      ? t('emptyFolder')
                      : t('emptyFiltered')
                    : t('emptyRecent')}
              </span>
            </p>
          ) : (
            <div className="recent-table">
              <div className="recent-columns">
                <span />
                <span className="col-name">{t('colName')}</span>
                <span className="col-path">{t('colLocation')}</span>
                <span>{t('colModified')}</span>
                <span className="col-size">{t('colSize')}</span>
                <span />
                <span />
              </div>
              <ul className="recent-list">
                {rows.map((row) => (
                  <li key={row.path}>
                    <div
                      className={`recent-item${row.missing ? ' missing' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (!row.missing) onOpen(row.path)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !row.missing) onOpen(row.path)
                      }}
                    >
                      <span />
                      <span className="recent-icon">
                        <FileGlyph ext={extensionOf(row.name)} />
                      </span>
                      <span className="recent-name">{row.name}</span>
                      <span className="recent-path">{row.location}</span>
                      <span className="recent-time">{formatModified(row.mtimeMs, lang)}</span>
                      <span className="recent-size">
                        {row.missing ? '' : formatSize(row.sizeBytes)}
                      </span>
                      <button
                        className={`star-btn${row.starred ? ' starred' : ''}`}
                        type="button"
                        aria-pressed={row.starred}
                        aria-label={t('navStarred')}
                        onClick={(event) => {
                          event.stopPropagation()
                          onLibrary(toggleStar(library, row.path, Date.now()))
                        }}
                      >
                        {row.starred ? '★' : '☆'}
                      </button>
                      {view !== 'folder' ? (
                        <button
                          className="star-btn"
                          type="button"
                          aria-label={t('removeFromList')}
                          title={t('removeFromList')}
                          onClick={(event) => {
                            event.stopPropagation()
                            onLibrary(dropRecords(library, [row.path]))
                          }}
                        >
                          ×
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function rowsFromLibrary(
  library: LibraryRecord[],
  stats: Record<string, FileEntry | null>,
  starredOnly: boolean,
): ListedFile[] {
  return library
    .filter((record) => !starredOnly || record.starred)
    .map((record) => {
      const entry = stats[record.path]
      const name = entry?.name || record.path.split(/[/\\]/).pop() || record.path
      return {
        path: record.path,
        name,
        location: parentName(record.path),
        mtimeMs: entry?.mtimeMs ?? record.openedAt,
        sizeBytes: entry?.sizeBytes ?? 0,
        missing: entry === null,
        starred: record.starred,
      }
    })
}

function toListed(entry: FileEntry, library: LibraryRecord[]): ListedFile {
  return {
    path: entry.path,
    name: entry.name,
    location: parentName(entry.path),
    mtimeMs: entry.mtimeMs ?? 0,
    sizeBytes: entry.sizeBytes ?? 0,
    missing: false,
    starred: library.some((record) => record.path === entry.path && record.starred),
  }
}

function NavButton({
  active,
  label,
  count,
  icon,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  icon: 'recent' | 'star'
  onClick: () => void
}) {
  return (
    <button className={`nav-item${active ? ' active' : ''}`} type="button" onClick={onClick}>
      {icon === 'recent' ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M8 4.8V8l2.2 1.6"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 1.9l1.9 3.85 4.25.62-3.07 3 .72 4.23L8 11.6l-3.8 2 .72-4.23-3.07-3 4.25-.62z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <span className="nav-label">{label}</span>
      <span className="nav-count">{count}</span>
    </button>
  )
}

function FolderNode({
  entry,
  depth,
  selected,
  expanded,
  childrenOf,
  onSelect,
  onToggle,
}: {
  entry: FileEntry
  depth: number
  selected: string | null
  expanded: Set<string>
  childrenOf: Record<string, FileEntry[]>
  onSelect: (path: string) => void
  onToggle: (path: string) => void
}) {
  const open = expanded.has(entry.path)
  const kids = childrenOf[entry.path] ?? []
  return (
    <li className="tree-item">
      <div
        className={`tree-row${selected === entry.path ? ' active' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <button
          className="tree-chevron"
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => onToggle(entry.path)}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden="true"
            style={{ transform: open ? 'rotate(90deg)' : undefined }}
          >
            <path
              d="M4.5 2.5l4 3.5-4 3.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
        <button className="tree-name" type="button" onClick={() => onSelect(entry.path)}>
          {entry.name}
        </button>
      </div>
      {open && kids.length > 0 ? (
        <ul className="tree-children" role="group">
          {kids.map((child) => (
            <FolderNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              selected={selected}
              expanded={expanded}
              childrenOf={childrenOf}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function FileGlyph({ ext }: { ext: string }) {
  const icon = ICONS[ext]
  if (icon) return <img src={icon} width={20} height={20} alt="" />
  return <FolderGlyph />
}

function FolderGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 4A1.5 1.5 0 0 1 3 2.5h3.1c.44 0 .85.19 1.13.52L8.4 4.4H13A1.5 1.5 0 0 1 14.5 5.9v5.6A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5V4z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function formatSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes <= 0) return '0 KB'
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function formatModified(mtimeMs: number, language: Lang): string {
  if (!mtimeMs) return ''
  const date = new Date(mtimeMs)
  const start = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((start(new Date()) - start(date)) / 86400000)
  const locale = language === 'zh' ? 'zh-CN' : language
  if (days <= 0)
    return `${t('today')} · ${date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return t('yesterday')
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}
