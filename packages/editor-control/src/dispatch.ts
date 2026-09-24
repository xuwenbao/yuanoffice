import { LIVE_TOOL_NAMES, type LiveCommandName, type LiveToolName } from './names.js'
import { LiveError, type EditorRegistry } from './registry.js'
import type { EditorSession } from './session.js'

export interface LiveToolResult {
  [key: string]: unknown
}

const MUTATING = new Set<LiveToolName>([
  'insert_content',
  'replace_blocks',
  'apply_ops',
  'apply_sheet_ops',
  'apply_slide_ops',
])

export function liveToolDefinitions(): Array<{ name: LiveToolName; description: string }> {
  return LIVE_TOOL_NAMES.map((name) => ({ name, description: DESCRIPTION[name] }))
}

const DESCRIPTION: Record<LiveToolName, string> = {
  open_documents:
    'List, read, or close documents open in the browser. close refuses a dirty document unless unsaved is "save" or "discard".',
  read_document: 'Read the editor memory of an open document, including unsaved edits. Does not write the file.',
  insert_content: 'Insert HTML into the open docs editor. Result persisted is false until save_document.',
  replace_blocks: 'Replace a block range in the open docs editor. Result persisted is false until save_document.',
  apply_ops: 'Apply docs ops to the open editor. Pass baseRevision to detect a stale read. persisted is false.',
  apply_sheet_ops: 'Apply sheet ops to the open sheets editor. persisted is false until save_document.',
  apply_slide_ops: 'Apply slide ops to the open slides editor. persisted is false until save_document.',
  read_pdf: 'Read text from the open PDF viewer.',
  save_document:
    'Write the open editor back to its own path. Pass path to save a copy; an existing target needs overwrite true.',
  document_status: 'Report dirty, revision, savedRevision, lastSavedAt, and connected for one open document.',
}

export async function dispatchLiveTool(
  registry: EditorRegistry,
  name: string,
  args: Record<string, unknown>,
  options: { save: (session: EditorSession, path: string, overwrite: boolean) => Promise<{ path: string }> },
): Promise<LiveToolResult> {
  if (!isTool(name)) throw new LiveError('unsupported', `unknown tool ${name}`)
  if (name === 'open_documents') return openDocuments(registry, args, options)
  const target = typeof args.document === 'string' ? args.document : typeof args.doc === 'string' ? args.doc : ''
  if (!target) {
    throw new LiveError('invalid_argument', `${name} needs document (an editor id or path)`)
  }
  const session = registry.resolve(target)
  if (!session.connected) {
    throw new LiveError('editor_disconnected', `${session.path} is registered but the page is gone`)
  }
  if (name === 'document_status') return statusOf(session)
  if (name === 'save_document') return saveDocument(registry, session, args, options)
  const base = args.baseRevision
  if (typeof base === 'number' && base !== session.revision) {
    throw new LiveError(
      'revision_conflict',
      `document changed: editor revision is ${session.revision}, request had ${base}`,
    )
  }
  const outcome = await session.run(name as LiveCommandName, args)
  const applied = MUTATING.has(name)
  return {
    ...(isRecord(outcome) ? outcome : { output: outcome }),
    applied,
    revision: session.revision,
    dirty: session.dirty,
    persisted: false,
  }
}

async function openDocuments(
  registry: EditorRegistry,
  args: Record<string, unknown>,
  options: { save: (session: EditorSession, path: string, overwrite: boolean) => Promise<{ path: string }> },
): Promise<LiveToolResult> {
  const action = String(args.action ?? 'list')
  if (action === 'list') {
    return {
      documents: registry.list().map((session) => ({
        id: session.editorId,
        type: session.family,
        title: session.title,
        path: session.path,
        dirty: session.dirty,
        connected: session.connected,
        revision: session.revision,
      })),
    }
  }
  const target = typeof args.target === 'string' ? args.target : ''
  if (!target) throw new LiveError('invalid_argument', `${action} needs target`)
  const session = registry.resolve(target)
  if (action === 'read') {
    if (!session.connected) {
      throw new LiveError('editor_disconnected', `${session.path} is registered but the page is gone`)
    }
    const content = await session.run(readCommand(session.family), {})
    return { id: session.editorId, path: session.path, dirty: session.dirty, content, persisted: false }
  }
  if (action === 'close') {
    if (session.dirty && args.unsaved !== 'save' && args.unsaved !== 'discard') {
      throw new LiveError(
        'unsaved_changes',
        `${session.title} has unsaved changes; pass unsaved "save" or "discard"`,
      )
    }
    let savedTo: string | undefined
    if (session.dirty && args.unsaved === 'save') {
      if (!session.connected) {
        throw new LiveError('editor_disconnected', 'cannot save a disconnected editor')
      }
      const saved = await options.save(session, session.path, true)
      savedTo = saved.path
    }
    registry.unregister(session.editorId, false)
    return { closed: true, id: session.editorId, ...(savedTo ? { savedTo } : {}) }
  }
  throw new LiveError('unsupported', `unknown open_documents action ${action}`)
}

async function saveDocument(
  registry: EditorRegistry,
  session: EditorSession,
  args: Record<string, unknown>,
  options: { save: (session: EditorSession, path: string, overwrite: boolean) => Promise<{ path: string }> },
): Promise<LiveToolResult> {
  const path = typeof args.path === 'string' && args.path ? args.path : session.path
  const overwrite = path === session.path || args.overwrite === true
  const saved = await options.save(session, path, overwrite)
  const savedRevision = session.revision
  registry.update(session.editorId, {
    dirty: false,
    savedRevision,
    lastSavedAt: new Date().toISOString(),
  })
  return { persisted: true, savedRevision, path: saved.path, dirty: false }
}

function statusOf(session: EditorSession): LiveToolResult {
  return {
    dirty: session.dirty,
    revision: session.revision,
    savedRevision: session.savedRevision,
    lastSavedAt: session.lastSavedAt,
    connected: session.connected,
    path: session.path,
  }
}

function readCommand(family: EditorSession['family']): LiveCommandName {
  if (family === 'pdf') return 'read_pdf'
  return 'read_document'
}

function isTool(name: string): name is LiveToolName {
  return (LIVE_TOOL_NAMES as readonly string[]).includes(name)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
