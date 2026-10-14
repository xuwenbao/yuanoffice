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

export interface LiveToolInputSchema {
  type: 'object'
  properties: Record<string, LiveToolSchemaProperty>
  required: string[]
}

interface LiveToolSchemaProperty {
  type: 'string' | 'integer' | 'boolean' | 'array' | 'object'
  description: string
  enum?: readonly string[]
  items?: { type: 'object' }
  maxItems?: number
}

export function liveToolDefinitions(): Array<{
  name: LiveToolName
  description: string
  inputSchema: LiveToolInputSchema
}> {
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

const documentField: LiveToolSchemaProperty = {
  type: 'string',
  description:
    'editor id or absolute path of an open document (from open_documents {action:"list"})',
}

const baseRevisionField: LiveToolSchemaProperty = {
  type: 'integer',
  description:
    'revision from the last read or status; a mismatch returns revision_conflict and does not run',
}

const requestIdField: LiveToolSchemaProperty = {
  type: 'string',
  description: 'agent request this edit belongs to',
}

const htmlInsert: LiveToolSchemaProperty = {
  type: 'string',
  description: 'restricted HTML fragment to insert',
}

const htmlReplace: LiveToolSchemaProperty = {
  type: 'string',
  description: 'restricted HTML fragment the range is replaced with',
}

const opsField = (description: string, maxItems?: number): LiveToolSchemaProperty => ({
  type: 'array',
  description,
  items: { type: 'object' },
  ...(maxItems === undefined ? {} : { maxItems }),
})

function objectSchema(
  properties: Record<string, LiveToolSchemaProperty>,
  required: string[] = [],
): LiveToolInputSchema {
  return { type: 'object', properties, required }
}

/** Field names match the desktop tools. Required fields follow this dispatcher. */
const INPUT_SCHEMA: Record<LiveToolName, LiveToolInputSchema> = {
  open_documents: objectSchema({
    action: {
      type: 'string',
      enum: ['list', 'read', 'close'],
      description: 'what to do; default "list"',
    },
    target: {
      type: 'string',
      description: 'editor id or path of the document; required for "read" and "close"',
    },
    unsaved: {
      type: 'string',
      enum: ['save', 'discard'],
      description:
        '"close" only: save before closing, or discard the changes. A dirty document is refused unless this is set.',
    },
  }),
  read_document: objectSchema({ document: documentField, baseRevision: baseRevisionField }, [
    'document',
  ]),
  insert_content: objectSchema(
    {
      document: documentField,
      html: htmlInsert,
      afterBlockIndex: {
        type: 'integer',
        description:
          'insert after this block index; -1 = start of document; omitted = after the block containing the cursor',
      },
      baseRevision: baseRevisionField,
      requestId: requestIdField,
    },
    ['document', 'html'],
  ),
  replace_blocks: objectSchema(
    {
      document: documentField,
      startBlockIndex: {
        type: 'integer',
        description: 'first block index to replace (inclusive)',
      },
      endBlockIndex: {
        type: 'integer',
        description: 'last block index to replace (inclusive)',
      },
      html: htmlReplace,
      baseRevision: baseRevisionField,
      requestId: requestIdField,
    },
    ['document', 'startBlockIndex', 'endBlockIndex', 'html'],
  ),
  apply_ops: objectSchema(
    {
      document: documentField,
      ops: opsField('array of op objects'),
      dryRun: {
        type: 'boolean',
        description: 'validate and plan the batch without changing the document',
      },
      baseRevision: baseRevisionField,
      requestId: requestIdField,
    },
    ['document', 'ops'],
  ),
  apply_sheet_ops: objectSchema(
    {
      document: documentField,
      ops: opsField(
        'array of workbook DSL op objects; each op addresses its worksheet with sheet (a name) or sheetId',
      ),
      dryRun: {
        type: 'boolean',
        description: 'plan the batch and report what would change, without modifying the grid',
      },
      baseRevision: baseRevisionField,
      requestId: requestIdField,
    },
    ['document', 'ops'],
  ),
  apply_slide_ops: objectSchema(
    {
      document: documentField,
      ops: opsField('array of op objects (at most 50 per transaction)', 50),
      isolation: {
        type: 'string',
        enum: ['atomic', 'per_op'],
        description: 'atomic (default) applies all-or-nothing; per_op applies independently',
      },
      dryRun: {
        type: 'boolean',
        description: 'validate and plan the batch without changing the deck',
      },
      baseRevision: baseRevisionField,
      requestId: requestIdField,
    },
    ['document', 'ops'],
  ),
  read_pdf: objectSchema({ document: documentField, baseRevision: baseRevisionField }, [
    'document',
  ]),
  save_document: objectSchema(
    {
      document: documentField,
      path: {
        type: 'string',
        description: "absolute path to save a copy; omit to write the document's own path",
      },
      overwrite: {
        type: 'boolean',
        description:
          "allow replacing an existing file at path; the document's own path is overwritten without this",
      },
    },
    ['document'],
  ),
  document_status: objectSchema({ document: documentField }, ['document']),
  subscribe_agent_requests: objectSchema(
    {
      sink: {
        type: 'object',
        description: 'webhook { type, url, secret? } or command { type, argv: string[] }',
      },
      filter: {
        type: 'object',
        description: 'optional families, paths, and kinds to match',
      },
      label: { type: 'string', description: 'name shown to the editor' },
      ttlSec: { type: 'integer', description: 'subscription lifetime in seconds' },
    },
    ['sink'],
  ),
  list_agent_subscriptions: objectSchema({}),
  unsubscribe_agent_requests: objectSchema(
    {
      subscriptionId: {
        type: 'string',
        description: 'id returned by subscribe_agent_requests',
      },
    },
    ['subscriptionId'],
  ),
  get_agent_request: objectSchema({ requestId: requestIdField }, ['requestId']),
  claim_agent_request: objectSchema(
    {
      requestId: requestIdField,
      agent: { type: 'string', description: 'name recorded as claimedBy' },
    },
    ['requestId'],
  ),
  complete_agent_request: objectSchema(
    {
      requestId: requestIdField,
      status: { type: 'string', enum: ['done', 'failed'], description: 'how the request ended' },
      summary: { type: 'string', description: 'short result shown in the editor' },
    },
    ['requestId', 'status'],
  ),
  post_agent_message: objectSchema(
    {
      requestId: requestIdField,
      text: { type: 'string', description: 'progress or reply shown in the AI panel' },
    },
    ['requestId', 'text'],
  ),
  list_agent_requests: objectSchema({
    status: {
      type: 'string',
      enum: ['pending', 'claimed', 'done', 'failed', 'cancelled'],
      description: 'when set, only requests in this state',
    },
  }),
  read_selection: objectSchema(
    {
      document: documentField,
      requestId: {
        type: 'string',
        description: 'when set, read this request anchor instead of the live caret',
      },
    },
    ['document'],
  ),
  replace_selection: objectSchema(
    {
      document: documentField,
      html: { type: 'string', description: 'replacement inline HTML' },
      requestId: requestIdField,
      expectedText: {
        type: 'string',
        description: 'text the anchor must still contain; a mismatch returns selection_changed',
      },
      baseRevision: baseRevisionField,
    },
    ['document', 'html'],
  ),
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
