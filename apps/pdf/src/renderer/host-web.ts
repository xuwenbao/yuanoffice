import {
  ControlLink,
  ServiceFiles,
  installFrameChild,
  postCloseResult,
  postDocState,
} from '@genoffice/platform-web'
import type { SavePdfRequest, SavePdfResult } from '../shared/ipc'
import { setPdfPlatform } from './platform'
import type { PdfApi } from '../shared/ipc'

const AI_PREFS = {
  side: 'left' as const,
  fontSize: 'default' as const,
  customFontSize: 14,
  spellcheck: true,
}

/**
 * Browser host for the desktop PDF page. Bytes move through the control
 * service. Annotation, drawing, and form state stay in the page; applying
 * those edits needs the desktop pdfium pipeline, so save writes the bytes
 * the page already holds and reports edit application as unavailable.
 */
export async function installPdfHost(): Promise<void> {
  await fetch('/api/session', { credentials: 'same-origin' })
  const params = new URLSearchParams(location.search)
  const editorId = params.get('editorId') || `pdf-${Math.random().toString(36).slice(2, 10)}`
  let pendingPath = params.get('path')
  let currentPath = pendingPath ?? ''
  let fileBytes: Uint8Array | null = null
  let dirty = false
  const files = new ServiceFiles('')
  const link = new ControlLink(
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
    '',
  )
  link.start('editor')
  const titleOf = (path: string) => path.split(/[/\\]/).pop() || path
  const publish = () => {
    if (!currentPath) return
    link.publish({
      editorId,
      path: currentPath,
      family: 'pdf',
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

  const implemented: Partial<PdfApi> = {
    async consumePending() {
      const path = pendingPath
      pendingPath = null
      return path
    },
    async readFile(path) {
      const bytes = await files.read(path)
      fileBytes = bytes
      currentPath = path
      publish()
      const copy = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(copy).set(bytes)
      return copy
    },
    async save(request: SavePdfRequest): Promise<SavePdfResult> {
      if (hasEdits(request)) {
        return { ok: false, error: 'Applying PDF edits is not available in the browser host' }
      }
      if (!fileBytes) return { ok: false, error: 'no file open' }
      const target = request.targetPath ?? request.path
      await files.write(target, fileBytes, true)
      currentPath = target
      dirty = false
      publish()
      return { ok: true }
    },
    async listStaticFormFills() {
      return []
    },
    async getUsername() {
      return ''
    },
    setDirty(next) {
      dirty = next
      publish()
    },
    async isUntitled() {
      return false
    },
    async canDrawText() {
      return true
    },
    async ocrPage() {
      return null
    },
    async listPageImages() {
      return []
    },
    async listSavedSignatures() {
      return []
    },
    async listEditFonts() {
      return []
    },
    async validateTextEdits() {
      return []
    },
    async autoRename() {
      return { renamed: false }
    },
    async gskStatus() {
      return { loggedIn: false }
    },
    async getLanguage() {
      return (localStorage.getItem('genoffice.language') || 'zh') as Awaited<
        ReturnType<PdfApi['getLanguage']>
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
    onCloseSaveRequest() {
      return () => {}
    },
    sendCloseSaveResult() {},
    onSaveAsRequest() {
      return () => {}
    },
    sendSaveAsResult() {},
    onSaveAsFlow() {
      return () => {}
    },
    onPrintRequest() {
      return () => {}
    },
    onFileRenamed() {
      return () => {}
    },
    onChromePressed() {
      return () => {}
    },
  }

  setPdfPlatform({
    api: new Proxy(implemented as PdfApi, {
      get(target, prop, receiver) {
        if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver)
        const name = String(prop)
        if (name.startsWith('on')) return () => () => {}
        if (name.startsWith('set') || name.startsWith('send')) return () => {}
        return async () => {
          throw new Error(`pdf web host has no ${name}`)
        }
      },
    }),
    ai: null,
    agentControl: null,
  })
}

function hasEdits(request: SavePdfRequest): boolean {
  return Boolean(
    request.markups.length ||
    request.annotDeletes?.length ||
    request.drawings.length ||
    request.noteEdits?.length ||
    request.formValues.length ||
    request.stamps.length ||
    request.textEdits?.length ||
    request.textInserts?.length ||
    request.imageEdits?.length ||
    request.redactions?.length ||
    request.staticFormFills?.length ||
    request.rotations?.length ||
    request.deletedPages?.length ||
    request.pageOrder?.length ||
    request.metadata,
  )
}
