import './shims/buffer'
import {
  ControlLink,
  ServiceFiles,
  installFrameChild,
  postCloseResult,
  postDocState,
} from '@genoffice/platform-web'
import {
  applyTxn,
  dataUrlMedia,
  deckDefaultFont,
  deckDirty,
  openDeck,
  renderSlides,
  saveOpenedBytes,
  textEditRequest,
  transformRequest,
} from '../domain/document'
import type { HistorySnapshot, Session } from '../domain/session'
import type { EditTextOp, EditTransformOp, OpenResult, SlidesApi } from '../shared/ipc'
import { setSlidesPlatform } from './platform'

const AI_PREFS = { side: 'left' as const, fontSize: 'default' as const, customFontSize: 14, spellcheck: true }

/**
 * Browser host for the desktop slides page. The deck is an OpenedPptx held
 * in the page. Open, text, transform, render, and save go through domain/.
 */
export async function installSlidesHost(): Promise<void> {
  await fetch('/api/session', { credentials: 'same-origin' })
  const params = new URLSearchParams(location.search)
  const editorId = params.get('editorId') || `slides-${Math.random().toString(36).slice(2, 10)}`
  const queuedPath = params.get('path')
  const files = new ServiceFiles('')
  const link = new ControlLink(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`, '')
  link.start('editor')
  let session: Session | null = null
  let consumed = false
  const historyHandlers = new Set<(state: { canUndo: boolean; canRedo: boolean }) => void>()

  const titleOf = (path: string) => path.split(/[/\\]/).pop() || path
  const publish = () => {
    if (!session?.path) return
    const dirty = deckDirty(session)
    link.publish({
      editorId,
      path: session.path,
      family: 'slides',
      title: titleOf(session.path),
      revision: dirty ? session.undoStack.length : 0,
      dirty,
    })
    postDocState({ title: titleOf(session.path), dirty, path: session.path })
  }
  const notifyHistory = () => {
    if (!session) return
    const state = { canUndo: session.undoStack.length > 0, canRedo: session.redoStack.length > 0 }
    for (const handler of historyHandlers) handler(state)
  }
  const rendered = () => {
    if (!session) return []
    return renderSlides(session.opened, session.fitWidthPx, dataUrlMedia(session.opened))
  }
  const openResult = (): OpenResult | null => {
    if (!session) return null
    return {
      path: session.path,
      slides: rendered(),
      size: { cx: session.opened.deck.size.cx, cy: session.opened.deck.size.cy },
      ...(deckDefaultFont(session.opened) ? { defaultFont: deckDefaultFont(session.opened) } : {}),
    }
  }
  installFrameChild({
    onCloseCheck(requestId) {
      postCloseResult('close-check-result', requestId, session ? deckDirty(session) : false)
    },
    onCloseSave(requestId) {
      postCloseResult('close-save-result', requestId, true)
    },
  })
  link.onCommand((command) => {
    link.reportResult({ requestId: command.requestId, ok: false, error: 'unsupported' })
  })

  async function openPath(path: string, fitWidthPx: number): Promise<OpenResult | null> {
    const bytes = await files.read(path)
    const opened = await openDeck(bytes)
    session = {
      path,
      opened,
      fitWidthPx,
      undoStack: [],
      redoStack: [],
    }
    publish()
    notifyHistory()
    return openResult()
  }

  const implemented: Partial<SlidesApi> = {
    async getLanguage() {
      return (localStorage.getItem('genoffice.language') || 'zh') as Awaited<ReturnType<SlidesApi['getLanguage']>>
    },
    onLanguageChanged() {
      return () => {}
    },
    async getTheme() {
      return (localStorage.getItem('genoffice.theme') as 'light' | 'dark' | 'system' | null) || 'system'
    },
    onThemeChanged() {
      return () => {}
    },
    async getAutoSaveDefault() {
      return { on: false, updatedAt: 0 }
    },
    onAutoSaveDefaultChanged() {
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
    onChromePressed() {
      return () => {}
    },
    async consumePendingOpen(fitWidthPx) {
      if (consumed || !queuedPath) return null
      consumed = true
      try {
        return await openPath(queuedPath, fitWidthPx)
      } catch (error) {
        console.error('[slides] open failed', error)
        throw error
      }
    },
    async openPptxPath(path, fitWidthPx) {
      return openPath(path, fitWidthPx)
    },
    async isDirty() {
      return session ? deckDirty(session) : false
    },
    async save() {
      if (!session?.path) return { ok: false, error: 'no file open' }
      try {
        const bytes = await saveOpenedBytes(session.opened)
        await files.write(session.path, bytes, true)
        publish()
        return { ok: true, path: session.path, slides: rendered() }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
    async editText(op: EditTextOp) {
      if (!session) return null
      pushUndo(session)
      const result = applyTxn(session.opened, textEditRequest(op))
      if (!result.applied) {
        session.undoStack.pop()
        return null
      }
      notifyHistory()
      publish()
      return rendered()[op.slideIndex] ?? null
    },
    async editTransform(op: EditTransformOp) {
      if (!session) return null
      const payload = transformRequest(session.opened, op)
      if (!payload) return null
      if (applyTxn(session.opened, { dryRun: true, ops: [payload] }).failures?.length) return null
      if (op.preview) {
        if (!session.transformPreview) {
          pushUndo(session)
          session.transformPreview = true
        }
      } else if (session.transformPreview) {
        session.transformPreview = false
      } else {
        pushUndo(session)
      }
      const result = applyTxn(session.opened, { ops: [payload] })
      if (!result.applied) {
        if (!op.preview) session.undoStack.pop()
        return null
      }
      notifyHistory()
      publish()
      return rendered()[op.slideIndex] ?? null
    },
    async undo() {
      if (!session || session.undoStack.length === 0) return null
      session.redoStack.push(takeSnapshot(session))
      restore(session, session.undoStack.pop()!)
      notifyHistory()
      publish()
      return rendered()
    },
    async redo() {
      if (!session || session.redoStack.length === 0) return null
      session.undoStack.push(takeSnapshot(session))
      restore(session, session.redoStack.pop()!)
      notifyHistory()
      publish()
      return rendered()
    },
    onHistoryChanged(handler) {
      historyHandlers.add(handler)
      return () => historyHandlers.delete(handler)
    },
    async getLayouts() {
      return null
    },
    async getTransition() {
      return 'none'
    },
    async getAnimations() {
      return []
    },
    async getNotes() {
      return ''
    },
    async getComments() {
      return []
    },
    async getSections() {
      return []
    },
    async hasSlideClipboard() {
      return false
    },
    async clipboardProbe() {
      return false
    },
    async getRecentFiles() {
      return []
    },
    async getAiSettings() {
      return {
        provider: 'openai',
        providers: {},
      } as Awaited<ReturnType<SlidesApi['getAiSettings']>>
    },
    async privateFontFaces() {
      return []
    },
    async fontMissing() {
      return []
    },
    async consumeHeadlessExport() {
      return null
    },
    headlessExportDone() {},
    onOpened() {
      return () => {}
    },
    onDeckChanged() {
      return () => {}
    },
    onRenamed() {
      return () => {}
    },
    onCloseSaveRequest() {
      return () => {}
    },
    reportCloseSaveResult() {},
    onMenuCommand() {
      return () => {}
    },
    onFontsChanged() {
      return () => {}
    },
  }

  setSlidesPlatform({
    api: new Proxy(implemented as SlidesApi, {
      get(target, prop, receiver) {
        if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver)
        const name = String(prop)
        if (name.startsWith('on')) return () => () => {}
        if (name.startsWith('set') || name.startsWith('report') || name.startsWith('headless')) return () => {}
        return async () => {
          throw new Error(`slides web host has no ${name}`)
        }
      },
    }),
    ai: null,
    agentControl: null,
  })
}

function takeSnapshot(session: Session): HistorySnapshot {
  return {
    slides: structuredClone(session.opened.deck.slides),
    entries: new Map(session.opened.archive.entries),
    size: { ...session.opened.deck.size },
    metaDirty: !!session.metaDirty,
  }
}

function pushUndo(session: Session): void {
  session.undoStack.push(takeSnapshot(session))
  session.redoStack = []
}

function restore(session: Session, snap: HistorySnapshot): void {
  session.opened.deck.slides = structuredClone(snap.slides)
  session.opened.deck.size = { ...snap.size }
  session.metaDirty = snap.metaDirty
  session.opened.archive.entries.clear()
  for (const [key, value] of snap.entries) session.opened.archive.entries.set(key, value)
}
