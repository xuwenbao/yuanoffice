export interface LibraryRecord {
  path: string
  openedAt: number
  starred: boolean
}

const KEY = 'genoffice.web.library'

interface Store {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function isRecord(value: unknown): value is LibraryRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as LibraryRecord
  return (
    typeof record.path === 'string' &&
    typeof record.openedAt === 'number' &&
    typeof record.starred === 'boolean'
  )
}

export function loadLibrary(store: Store = localStorage): LibraryRecord[] {
  try {
    const parsed = JSON.parse(store.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter(isRecord) : []
  } catch {
    return []
  }
}

export function saveLibrary(records: LibraryRecord[], store: Store = localStorage): void {
  store.setItem(KEY, JSON.stringify(records))
}

/** Newest open first. A star already on this path stays. */
export function remember(
  records: readonly LibraryRecord[],
  path: string,
  now: number,
): LibraryRecord[] {
  const prev = records.find((record) => record.path === path)
  const next = { path, openedAt: now, starred: prev?.starred ?? false }
  return [next, ...records.filter((record) => record.path !== path)].slice(0, 200)
}

export function toggleStar(
  records: readonly LibraryRecord[],
  path: string,
  now: number,
): LibraryRecord[] {
  const found = records.find((record) => record.path === path)
  if (!found) return [{ path, openedAt: now, starred: true }, ...records]
  return records.map((record) =>
    record.path === path ? { ...record, starred: !record.starred } : record,
  )
}

export function dropRecords(
  records: readonly LibraryRecord[],
  paths: readonly string[],
): LibraryRecord[] {
  const gone = new Set(paths)
  return records.filter((record) => !gone.has(record.path))
}

const FAMILIES: Record<string, readonly string[]> = {
  docx: ['docx', 'doc'],
  xlsx: ['xlsx', 'xlsm', 'xls', 'csv'],
  pptx: ['pptx', 'ppt'],
  pdf: ['pdf'],
  md: ['md', 'markdown'],
  html: ['html', 'htm'],
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

export function matchesExt(name: string, filter: string): boolean {
  if (filter === 'all') return true
  return (FAMILIES[filter] ?? [filter]).includes(extensionOf(name))
}

export function matchesQuery(name: string, location: string, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return name.toLowerCase().includes(needle) || location.toLowerCase().includes(needle)
}

/** Returns `base.ext`, then `base 2.ext`, skipping names that already exist. */
export function nextFileName(existing: readonly string[], base: string, ext: string): string {
  const taken = new Set(existing)
  const first = `${base}.${ext}`
  if (!taken.has(first)) return first
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} ${n}.${ext}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base} ${Date.now()}.${ext}`
}

export function parentName(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean)
  return parts.length >= 2 ? parts[parts.length - 2]! : ''
}
