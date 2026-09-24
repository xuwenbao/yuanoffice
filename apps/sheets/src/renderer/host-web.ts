import {
  ControlLink,
  ServiceFiles,
  installFrameChild,
  postCloseResult,
  postDocState,
} from '@genoffice/platform-web'
import {
  workbookFileSchema,
  workbookRangeResultSchema,
  type WorkbookFile,
} from '../shared/desktop-api'
import type { DesktopApi } from '../shared/desktop-api'
import { setSheetsPlatform } from './platform'

const AI_PREFS = {
  side: 'left' as const,
  fontSize: 'default' as const,
  customFontSize: 14,
  spellcheck: true,
}
const EDIT_KEYS = [
  'edits',
  'bulkConstantFills',
  'structuralOps',
  'chartEdits',
  'visualEdits',
  'visualAdditions',
  'tableAdditions',
  'pivotAdditions',
  'sheetOps',
  'sheetOrder',
  'filterStates',
  'hyperlinkEdits',
  'cfStates',
  'dvStates',
  'pageSetupStates',
  'noteStates',
] as const

interface WorkerReply {
  type: 'reply' | 'error'
  requestId: number
  text?: string
  error?: string
}

/**
 * Browser host for the desktop sheets page. The Univer grid stays in App.
 * Opening and reading a range go through the wasm reactor in a worker.
 * Saving an unchanged workbook writes the original bytes back through the
 * control service. Applying edits needs the desktop sidecar.
 */
export async function installSheetsHost(): Promise<void> {
  await fetch('/api/session', { credentials: 'same-origin' })
  const params = new URLSearchParams(location.search)
  const editorId = params.get('editorId') || `sheets-${Math.random().toString(36).slice(2, 10)}`
  const queuedPath = params.get('path')
  const files = new ServiceFiles('')
  const link = new ControlLink(
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
    '',
  )
  link.start('editor')
  let opened = false
  let currentPath = queuedPath ?? ''
  let original: Uint8Array | null = null
  let file: WorkbookFile | null = null
  let dirty = false
  let worker: Worker | null = null
  let nextId = 1
  const pending = new Map<
    number,
    { resolve: (text: string) => void; reject: (error: Error) => void }
  >()

  const titleOf = (path: string) => path.split(/[/\\]/).pop() || path
  const publish = () => {
    if (!currentPath) return
    link.publish({
      editorId,
      path: currentPath,
      family: 'sheets',
      title: titleOf(currentPath),
      revision: dirty ? 1 : 0,
      dirty,
    })
    postDocState({ title: titleOf(currentPath), dirty, path: currentPath })
  }
  installFrameChild({
    onCloseCheck(requestId) {
      postCloseResult('close-check-result', requestId, dirty)
    },
    onCloseSave(requestId) {
      postCloseResult('close-save-result', requestId, !dirty)
    },
  })
  link.onCommand((command) => {
    link.reportResult({ requestId: command.requestId, ok: false, error: 'unsupported' })
  })

  function ensureWorker(): Worker {
    if (worker) return worker
    worker = new Worker(new URL('./wasm/worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const waiter = pending.get(event.data.requestId)
      if (!waiter) return
      pending.delete(event.data.requestId)
      if (event.data.type === 'error')
        waiter.reject(new Error(event.data.error || 'xlsx worker failed'))
      else waiter.resolve(event.data.text ?? '')
    }
    return worker
  }

  function callWorker(message: Record<string, unknown>): Promise<string> {
    const requestId = nextId++
    const current = ensureWorker()
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      current.postMessage({ ...message, requestId })
    })
  }

  async function dispatch(line: string): Promise<unknown> {
    const text = await callWorker({ type: 'dispatch', line })
    return parseReply(text)
  }

  const implemented: Partial<DesktopApi> = {
    async getLanguage() {
      return (localStorage.getItem('genoffice.language') || 'zh') as Awaited<
        ReturnType<DesktopApi['getLanguage']>
      >
    },
    onLanguageChanged() {
      return () => {}
    },
    async getTheme() {
      return (
        (localStorage.getItem('genoffice.theme') as 'light' | 'dark' | 'system' | null) || 'system'
      )
    },
    onThemeChanged() {
      return () => {}
    },
    async getAiPanelPrefs() {
      return AI_PREFS
    },
    async setAiPanelPrefs(patch) {
      return { ...AI_PREFS, ...patch }
    },
    onAiPanelPrefsChanged() {
      return () => {}
    },
    async getAutoSaveDefault() {
      return { on: false, updatedAt: 0 }
    },
    onAutoSaveDefaultChanged() {
      return () => {}
    },
    async consumeNewBlankWorkbook() {
      return false
    },
    async hasQueuedWorkbook() {
      return !opened && !!queuedPath
    },
    async selectWorkbook() {
      if (!queuedPath) return null
      opened = true
      const book = await files.read(queuedPath)
      original = book
      currentPath = queuedPath
      const wasm = await loadReactor()
      const text = await callWorker({ type: 'open', wasm, book })
      const meta = (await parseReply(text)) as Record<string, unknown>
      const sha256 = await digest(book)
      const parsed = workbookFileSchema.safeParse({
        ...meta,
        path: queuedPath,
        sha256,
        fileBytes: book.byteLength,
        readOnly: false,
      })
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues[0]?.message ?? 'workbook metadata did not match the page',
        )
      }
      file = parsed.data
      publish()
      return file
    },
    async readWorkbookRange(request) {
      const result = await dispatch(
        JSON.stringify({
          command: {
            command: 'read_range',
            sessionId: request.sessionId,
            sheetId: request.sheetId,
            range: request.range,
          },
        }),
      )
      const parsed = workbookRangeResultSchema.safeParse(result)
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'range result did not match the page')
      }
      return parsed.data
    },
    async closeWorkbook() {
      if (file) {
        await dispatch(
          JSON.stringify({ command: { command: 'close', sessionId: file.sessionId } }),
        ).catch(() => {})
      }
      worker?.terminate()
      worker = null
      file = null
    },
    async saveWorkbookEdits(request) {
      if (hasEdits(request)) {
        throw new Error('Applying spreadsheet edits is not available in the browser host')
      }
      if (!original || !file || !currentPath) throw new Error('no workbook open')
      const written = await files.write(currentPath, original, true)
      dirty = false
      file = { ...file, sha256: written.sha256, path: written.path }
      publish()
      return { canceled: false, file, touchedEntries: [] }
    },
    async writeWorkbookRecovery() {
      return { ok: false }
    },
    async getAiSettings() {
      return { provider: 'openai', providers: {} } as Awaited<
        ReturnType<DesktopApi['getAiSettings']>
      >
    },
  }

  setSheetsPlatform({
    api: new Proxy(implemented as DesktopApi, {
      get(target, prop, receiver) {
        if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver)
        const name = String(prop)
        if (name.startsWith('on')) return () => () => {}
        if (name.startsWith('set') || name.startsWith('report') || name.startsWith('send'))
          return () => {}
        return async () => null
      },
    }),
    ai: null,
    agentControl: null,
  })
}

async function loadReactor(): Promise<ArrayBuffer> {
  const response = await fetch(`${import.meta.env.BASE_URL}xlsx-sidecar.wasm`)
  if (!response.ok) {
    throw new Error(
      'The xlsx wasm reactor is not built. Install a WASI sysroot and run the sheets wasm build. The grid is up, but this workbook cannot be opened.',
    )
  }
  return response.arrayBuffer()
}

function parseReply(text: string): unknown {
  const reply = JSON.parse(text) as { ok?: boolean; result?: unknown; error?: string }
  if (!reply.ok) throw new Error(reply.error || 'xlsx reactor failed')
  return reply.result
}

function hasEdits(request: object): boolean {
  const record = request as Record<string, unknown>
  return EDIT_KEYS.some((key) => Array.isArray(record[key]) && record[key].length > 0)
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
