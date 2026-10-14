import {
  dispatchAgentServiceTool,
  isSelectionTool,
  isServiceAgentTool,
  selectionPayload,
  type AgentToolOptions,
} from './agent-tools.js'
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
  'replace_selection',
])

export interface LiveToolDefinition {
  name: LiveToolName
  description: string
  inputSchema: Record<string, unknown>
}

export function liveToolDefinitions(): LiveToolDefinition[] {
  return LIVE_TOOL_NAMES.map((name) => ({
    name,
    description: DESCRIPTION[name],
    inputSchema: INPUT_SCHEMA[name],
  }))
}

const DESCRIPTION: Record<LiveToolName, string> = {
  open_documents:
    'List, read, or close documents open in the browser. close refuses a dirty document unless unsaved is "save" or "discard".',
  read_document:
    'Read the editor memory of an open document, including unsaved edits. Does not write the file.',
  insert_content:
    'Insert HTML into the open docs editor. Result persisted is false until save_document.',
  replace_blocks:
    'Replace a block range in the open docs editor. Result persisted is false until save_document.',
  apply_ops:
    'Apply docs ops to the open editor. Pass baseRevision to detect a stale read. persisted is false.',
  apply_sheet_ops:
    'Apply sheet ops to the open sheets editor. persisted is false until save_document.',
  apply_slide_ops:
    'Apply slide ops to the open slides editor. persisted is false until save_document.',
  read_pdf: 'Read text from the open PDF viewer.',
  save_document:
    'Write the open editor back to its own path. Pass path to save a copy; an existing target needs overwrite true.',
  document_status:
    'Report dirty, revision, savedRevision, lastSavedAt, and connected for one open document.',
  subscribe_agent_requests:
    'Register a webhook or command that is called when an editor creates an agent request. Loopback URLs only, unless the service was started with --allow-remote-callback.',
  list_agent_subscriptions:
    'List agent callback subscriptions registered with this control service.',
  unsubscribe_agent_requests: 'Remove an agent callback subscription by subscriptionId.',
  get_agent_request:
    'Read one agent request plus a fresh selection context. The callback body does not include document text; use this tool to fetch it.',
  claim_agent_request:
    'Claim a pending agent request. A second caller receives request_claimed. Editing tools require a claim.',
  complete_agent_request:
    'Finish a claimed agent request as done or failed, with a short summary shown in the editor.',
  post_agent_message:
    'Post a progress or reply message for a claimed agent request. The editor shows it in the AI panel.',
  list_agent_requests:
    'List agent requests still in memory. Non-blocking inbox for an interactive session; pass status to filter.',
  read_selection:
    'Read the user selection. Pass requestId to read the anchored target of an agent request instead of the live caret.',
  replace_selection:
    'Replace the anchored selection with inline HTML. Pass requestId and expectedText. A mismatch returns selection_changed and does not edit. persisted is false until save_document. A target that spans several blocks is refused; use replace_blocks.',
}

const doc = { type: 'string', description: 'editor id or path' }
const requestId = { type: 'string', description: 'agent request this edit belongs to' }

const INPUT_SCHEMA: Record<LiveToolName, Record<string, unknown>> = {
  open_documents: {
    type: 'object',
    additionalProperties: true,
    properties: {
      action: { type: 'string', enum: ['list', 'read', 'close'] },
      target: { type: 'string' },
      unsaved: { type: 'string', enum: ['save', 'discard'] },
    },
  },
  read_document: {
    type: 'object',
    additionalProperties: true,
    required: ['document'],
    properties: { document: doc },
  },
  insert_content: {
    type: 'object',
    additionalProperties: true,
    required: ['document', 'html'],
    properties: {
      document: doc,
      html: { type: 'string' },
      afterBlockIndex: { type: 'integer' },
      requestId,
    },
  },
  replace_blocks: {
    type: 'object',
    additionalProperties: true,
    required: ['document', 'html', 'startBlockIndex', 'endBlockIndex'],
    properties: {
      document: doc,
      html: { type: 'string' },
      startBlockIndex: { type: 'integer' },
      endBlockIndex: { type: 'integer' },
      requestId,
    },
  },
  apply_ops: {
    type: 'object',
    additionalProperties: true,
    required: ['document', 'ops'],
    properties: {
      document: doc,
      ops: { type: 'array' },
      dryRun: { type: 'boolean' },
      baseRevision: { type: 'number' },
      requestId,
    },
  },
  apply_sheet_ops: {
    type: 'object',
    additionalProperties: true,
    required: ['document', 'ops'],
    properties: {
      document: doc,
      ops: { type: 'array' },
      baseRevision: { type: 'number' },
      requestId,
    },
  },
  apply_slide_ops: {
    type: 'object',
    additionalProperties: true,
    required: ['document', 'ops'],
    properties: {
      document: doc,
      ops: { type: 'array' },
      baseRevision: { type: 'number' },
      requestId,
    },
  },
  read_pdf: {
    type: 'object',
    additionalProperties: true,
    required: ['document'],
    properties: { document: doc },
  },
  save_document: {
    type: 'object',
    additionalProperties: true,
    required: ['document'],
    properties: { document: doc, path: { type: 'string' }, overwrite: { type: 'boolean' } },
  },
  document_status: {
    type: 'object',
    additionalProperties: true,
    required: ['document'],
    properties: { document: doc },
  },
  subscribe_agent_requests: {
    type: 'object',
    additionalProperties: false,
    required: ['sink'],
    properties: {
      sink: {
        type: 'object',
        description: '{ type: "webhook", url, secret? } or { type: "command", argv: string[] }',
      },
      filter: {
        type: 'object',
        description: 'Optional families, paths, and kinds to match',
      },
      label: { type: 'string' },
      ttlSec: { type: 'number' },
    },
  },
  list_agent_subscriptions: { type: 'object', additionalProperties: false, properties: {} },
  unsubscribe_agent_requests: {
    type: 'object',
    additionalProperties: false,
    required: ['subscriptionId'],
    properties: { subscriptionId: { type: 'string' } },
  },
  get_agent_request: {
    type: 'object',
    additionalProperties: false,
    required: ['requestId'],
    properties: { requestId: { type: 'string' } },
  },
  claim_agent_request: {
    type: 'object',
    additionalProperties: false,
    required: ['requestId'],
    properties: { requestId: { type: 'string' }, agent: { type: 'string' } },
  },
  complete_agent_request: {
    type: 'object',
    additionalProperties: false,
    required: ['requestId', 'status'],
    properties: {
      requestId: { type: 'string' },
      status: { type: 'string', enum: ['done', 'failed'] },
      summary: { type: 'string' },
    },
  },
  post_agent_message: {
    type: 'object',
    additionalProperties: false,
    required: ['requestId', 'text'],
    properties: { requestId: { type: 'string' }, text: { type: 'string' } },
  },
  list_agent_requests: {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: {
        type: 'string',
        enum: ['pending', 'claimed', 'done', 'failed', 'cancelled'],
      },
    },
  },
  read_selection: {
    type: 'object',
    additionalProperties: false,
    required: ['document'],
    properties: { document: { type: 'string' }, requestId: { type: 'string' } },
  },
  replace_selection: {
    type: 'object',
    additionalProperties: false,
    required: ['document', 'html'],
    properties: {
      document: { type: 'string' },
      html: { type: 'string', description: 'replacement inline HTML' },
      requestId: { type: 'string' },
      expectedText: { type: 'string', description: 'text the anchor must still contain' },
      baseRevision: { type: 'number' },
    },
  },
}

export async function dispatchLiveTool(
  registry: EditorRegistry,
  name: string,
  args: Record<string, unknown>,
  options: {
    save: (session: EditorSession, path: string, overwrite: boolean) => Promise<{ path: string }>
  } & AgentToolOptions,
): Promise<LiveToolResult> {
  if (!isTool(name)) throw new LiveError('unsupported', `unknown tool ${name}`)
  if (name === 'open_documents') return openDocuments(registry, args, options)
  if (isServiceAgentTool(name)) return dispatchAgentServiceTool(registry, name, args, options)
  const target =
    typeof args.document === 'string' ? args.document : typeof args.doc === 'string' ? args.doc : ''
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
  const payload = isSelectionTool(name) ? selectionPayload(args, options) : args
  const outcome = await session.run(name as LiveCommandName, payload)
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
  options: {
    save: (session: EditorSession, path: string, overwrite: boolean) => Promise<{ path: string }>
  },
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
      throw new LiveError(
        'editor_disconnected',
        `${session.path} is registered but the page is gone`,
      )
    }
    const content = await session.run(readCommand(session.family), {})
    return {
      id: session.editorId,
      path: session.path,
      dirty: session.dirty,
      content,
      persisted: false,
    }
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
  options: {
    save: (session: EditorSession, path: string, overwrite: boolean) => Promise<{ path: string }>
  },
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
