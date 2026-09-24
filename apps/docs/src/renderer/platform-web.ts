import { ControlLink, DraftStore, ServiceFiles, downloadBytes, installFrameChild, postCloseResult, postDocState } from '@genoffice/platform-web'
import type { AgentControlPort, DocumentRef } from '@genoffice/platform'
import type { AiSettings } from '@genoffice/ai-provider'
import type {
  AutoSaveDefault,
  DesktopApi,
  McpCommandMessage,
  McpEditorCommand,
  OpenDocxResult,
  OpenFileResult,
  UiTheme,
} from '../shared/ipc'
import type { DocsPlatform } from './platform'

const MCP_COMMANDS = new Set<McpEditorCommand>([
  'insert_content',
  'replace_blocks',
  'apply_ops',
  'read_document',
  'save_document',
])

/**
 * Browser host. File bytes move through the control service. Commands from an
 * external agent arrive on the editor WebSocket. Model calls are rejected.
 */
export async function createWebDocsPlatform(): Promise<DocsPlatform> {
  await fetch('/api/session', { credentials: 'same-origin' })
  const files = new ServiceFiles('')
  const drafts = new DraftStore()
  const link = new ControlLink(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`, '')
  link.start('editor')
  let dirty = false
  installFrameChild({
    onCloseCheck(requestId) {
      postCloseResult('close-check-result', requestId, dirty)
    },
    onCloseSave(requestId) {
      postCloseResult('close-save-result', requestId, false)
    },
  })
  const api = createWebDesktopApi(files, drafts, link)
  const agentControl: AgentControlPort = {
    onCommand(handler) {
      return link.onCommand((command) => {
        if (!MCP_COMMANDS.has(command.command as McpEditorCommand)) return
        handler(command)
      })
    },
    reportResult(result) {
      link.reportResult(result)
    },
    publish(state) {
      dirty = state.dirty
      link.publish(state)
      postDocState({ title: state.title, dirty: state.dirty, path: state.path })
    },
    close(editorId, dirty) {
      link.closeEditor(editorId, dirty)
    },
  }
  return {
    api,
    ai: null,
    agentControl,
    download: downloadBytes,
    file: {
      async read(ref: DocumentRef) {
        const data = await files.read(ref.path)
        return { data: data.buffer as ArrayBuffer, name: nameOf(ref.path), hash: await sha256(data) }
      },
      async save(ref, data) {
        const written = await files.write(ref.path, new Uint8Array(data), true)
        return { ok: true, path: written.path }
      },
    },
  }
}

function createWebDesktopApi(files: ServiceFiles, drafts: DraftStore, link: ControlLink): DesktopApi {
  const themeHandlers = new Set<(theme: UiTheme) => void>()
  const langHandlers = new Set<(lang: UiTheme extends never ? never : string) => void>()
  const mcpHandlers = new Set<(message: McpCommandMessage) => void>()
  const closeCheck = new Set<() => void>()
  const closeSave = new Set<() => void>()
  let pendingPath = new URLSearchParams(location.search).get('path')
  link.onCommand((command) => {
    if (!MCP_COMMANDS.has(command.command as McpEditorCommand)) return
    const message: McpCommandMessage = {
      requestId: command.requestId,
      command: command.command as McpEditorCommand,
      payload: command.payload,
    }
    for (const handler of mcpHandlers) handler(message)
  })

  const implemented: Partial<DesktopApi> = {
    async getLanguage() {
      return (localStorage.getItem('genoffice.language') || 'zh') as Awaited<
        ReturnType<DesktopApi['getLanguage']>
      >
    },
    onLanguageChanged(handler) {
      const wrapped = (language: string) =>
        handler(language as Parameters<typeof handler>[0])
      langHandlers.add(wrapped as never)
      return () => langHandlers.delete(wrapped as never)
    },
    async getTheme() {
      return (localStorage.getItem('genoffice.theme') as UiTheme | null) || 'system'
    },
    onThemeChanged(handler) {
      themeHandlers.add(handler)
      return () => themeHandlers.delete(handler)
    },
    async getAutoSaveDefault(): Promise<AutoSaveDefault> {
      return { on: false, updatedAt: 0 }
    },
    onAutoSaveDefaultChanged() {
      return () => {}
    },
    async getAiPanelPrefs() {
      return { side: 'left', fontSize: 'default', customFontSize: 14, spellcheck: true }
    },
    async setAiPanelPrefs(patch) {
      return { side: 'left', fontSize: 'default', customFontSize: 14, spellcheck: true, ...patch }
    },
    onAiPanelPrefsChanged() {
      return () => {}
    },
    onChromePressed() {
      return () => {}
    },
    async openDocx() {
      const path = window.prompt('Absolute path inside an allowed root')
      if (!path) return null
      return openPath(files, path)
    },
    async openDocxPath(path: string) {
      return openPath(files, path)
    },
    async consumePendingOpenDocx() {
      const path = pendingPath
      pendingPath = null
      if (!path) return null
      return openPath(files, path)
    },
    async consumeNewBlankDoc() {
      return pendingPath === null && !new URLSearchParams(location.search).get('path')
    },
    async consumeAiDocContent() {
      return null
    },
    async consumeHeadlessExport() {
      return null
    },
    async saveDocx(path, data) {
      await files.write(path, new Uint8Array(data), true)
      await drafts.delete(path).catch(() => {})
      return { ok: true }
    },
    async saveDocxAs(defaultName, data) {
      const path = window.prompt('Save as absolute path', defaultName) ?? ''
      if (!path) return { ok: false, error: 'cancelled' }
      await files.write(path, new Uint8Array(data), true)
      return { ok: true, path }
    },
    async saveDocxNew(defaultName, data) {
      return saveNewInRoot(files, defaultName, data)
    },
    async saveDocxTo(path, data, overwrite) {
      await files.write(path, new Uint8Array(data), overwrite)
      return { ok: true, path }
    },
    async writeRecoveryCopy(path, data) {
      await drafts.put({ path, updatedAt: Date.now(), bytes: data })
      return { ok: true }
    },
    async getRecentFiles() {
      return []
    },
    onMcpCommand(handler) {
      mcpHandlers.add(handler)
      return () => mcpHandlers.delete(handler)
    },
    reportMcpResult(result) {
      link.reportResult(result)
    },
    signalMcpReady() {},
    async print() {
      window.print()
      return { ok: true }
    },
    onCloseCheck(handler) {
      closeCheck.add(handler)
      return () => closeCheck.delete(handler)
    },
    reportCloseCheck() {},
    onCloseSaveRequest(handler) {
      closeSave.add(handler)
      return () => closeSave.delete(handler)
    },
    reportCloseSaveResult() {},
    onMenuCommand() {
      return () => {}
    },
    onOpenDocx() {
      return () => {}
    },
    onRenamedDocx() {
      return () => {}
    },
    onTeardown() {
      return () => {}
    },
    async getAiSettings() {
      return { provider: 'genspark', providers: {} } as AiSettings
    },
    async listDocsTabs() {
      return []
    },
    async focusDocsTab() {},
    async openNewTab() {},
    onAiStream() {
      return () => {}
    },
    reportViewMenuState() {},
  }

  return new Proxy(implemented as DesktopApi, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && prop in target) return Reflect.get(target, prop, receiver)
      if (typeof prop !== 'string') return undefined
      if (prop.startsWith('on')) return () => () => {}
      return () => Promise.reject(new Error(`${prop} is not available in the browser host`))
    },
  })
}

async function saveNewInRoot(
  files: ServiceFiles,
  defaultName: string,
  data: ArrayBuffer,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const roots = await files.list('')
  const dir = roots.find((entry) => entry.kind === 'dir')?.path
  if (!dir) return { ok: false, error: 'no allowed folder' }
  const base = defaultName.split(/[/\\]/).pop() || 'document.docx'
  const name = base.toLowerCase().endsWith('.docx') ? base : `${base}.docx`
  const taken = new Set((await files.list(dir)).map((entry) => entry.name))
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let candidate = name
  for (let n = 2; taken.has(candidate) && n < 1000; n++) candidate = `${stem} ${n}${ext}`
  const path = `${dir.replace(/[/\\]+$/, '')}/${candidate}`
  await files.write(path, new Uint8Array(data), false)
  return { ok: true, path }
}

async function openPath(files: ServiceFiles, path: string): Promise<OpenDocxResult> {
  const bytes = await files.read(path)
  const blob = new Blob([bytes.slice()], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  const opened: OpenFileResult = {
    path,
    name: nameOf(path),
    dataUrl: URL.createObjectURL(blob),
    hash: await sha256(bytes),
  }
  return opened
}

function nameOf(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return slash >= 0 ? path.slice(slash + 1) : path
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
