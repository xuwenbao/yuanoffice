/**
 * MCP tools that route an agent request. Editing still runs in the open editor.
 * Design: docs/agent-extension.md
 */
import type { LiveToolName } from './names.js'
import { EditorRegistry, LiveError } from './registry.js'
import {
  AGENT_REQUEST_KINDS,
  AGENT_REQUEST_STATUSES,
  type AgentRequestKind,
  type AgentRequestStatus,
  type AgentRequestStore,
} from './requests.js'
import {
  AgentSubscriptions,
  type AgentSink,
  type AgentSubscriptionFilter,
} from './subscriptions.js'
type LiveToolResult = Record<string, unknown>

export const SERVICE_AGENT_TOOLS = [
  'subscribe_agent_requests',
  'list_agent_subscriptions',
  'unsubscribe_agent_requests',
  'get_agent_request',
  'claim_agent_request',
  'complete_agent_request',
  'post_agent_message',
  'list_agent_requests',
] as const

export type ServiceAgentTool = (typeof SERVICE_AGENT_TOOLS)[number]

export function isServiceAgentTool(name: string): name is ServiceAgentTool {
  return (SERVICE_AGENT_TOOLS as readonly string[]).includes(name)
}

export interface AgentToolOptions {
  requests?: AgentRequestStore
  subscriptions?: AgentSubscriptions
  allowRemoteCallback?: boolean
  onAgentsChanged?: () => void
}

const SELECTION_TOOLS = new Set<LiveToolName>(['read_selection', 'replace_selection'])

export function isSelectionTool(name: string): boolean {
  return SELECTION_TOOLS.has(name as LiveToolName)
}

export async function dispatchAgentServiceTool(
  registry: EditorRegistry,
  name: ServiceAgentTool,
  args: Record<string, unknown>,
  options: AgentToolOptions,
): Promise<LiveToolResult> {
  if (name === 'subscribe_agent_requests') return subscribe(args, options)
  if (name === 'list_agent_subscriptions') {
    return { subscriptions: subscriptions(options).list().map(publicSubscription) }
  }
  if (name === 'unsubscribe_agent_requests') {
    const id = stringArg(args, 'subscriptionId')
    const removed = subscriptions(options).unsubscribe(id)
    if (!removed) throw new LiveError('request_not_found', `no agent subscription ${id}`)
    options.onAgentsChanged?.()
    return { removed: true, subscriptionId: id }
  }
  if (name === 'list_agent_requests') {
    const status = args.status === undefined ? undefined : statusArg(args.status)
    return { requests: requests(options).list(status) }
  }
  if (name === 'get_agent_request') return readRequest(registry, args, options)
  if (name === 'claim_agent_request') {
    const request = requests(options).claim(
      stringArg(args, 'requestId'),
      typeof args.agent === 'string' && args.agent ? args.agent : 'external',
    )
    return { request }
  }
  if (name === 'complete_agent_request') {
    const status = args.status === 'failed' ? 'failed' : args.status === 'done' ? 'done' : ''
    if (!status) {
      throw new LiveError(
        'invalid_argument',
        'complete_agent_request status must be done or failed',
      )
    }
    const request = requests(options).complete(
      stringArg(args, 'requestId'),
      status,
      typeof args.summary === 'string' ? args.summary : '',
    )
    return { request }
  }
  const request = requests(options).message(stringArg(args, 'requestId'), stringArg(args, 'text'))
  return { requestId: request.requestId, posted: true }
}

/** Attach the stored targets so the editor edits the anchor, not the live caret. */
export function selectionPayload(
  args: Record<string, unknown>,
  options: AgentToolOptions,
): Record<string, unknown> {
  const requestId = args.requestId
  if (typeof requestId !== 'string' || !requestId) return args
  const request = requests(options).get(requestId)
  if (request.status === 'cancelled') {
    throw new LiveError('request_cancelled', `agent request ${requestId} was cancelled`)
  }
  if (request.status !== 'claimed') {
    throw new LiveError('invalid_argument', `claim agent request ${requestId} before editing it`)
  }
  return { ...args, targets: request.targets }
}

async function readRequest(
  registry: EditorRegistry,
  args: Record<string, unknown>,
  options: AgentToolOptions,
): Promise<LiveToolResult> {
  const request = requests(options).get(stringArg(args, 'requestId'))
  const session = registry.resolve(request.editorId)
  if (!session.connected) {
    throw new LiveError('editor_disconnected', `${session.path} is registered but the page is gone`)
  }
  const context = await session.run('read_selection', {
    requestId: request.requestId,
    targets: request.targets,
  })
  return { request, context, revision: session.revision }
}

function subscribe(args: Record<string, unknown>, options: AgentToolOptions): LiveToolResult {
  const sink = parseSink(args.sink)
  const filter = parseFilter(args.filter)
  const id = `sub-${crypto.randomUUID()}`
  const label =
    typeof args.label === 'string' && args.label
      ? args.label
      : sink.type === 'webhook'
        ? sink.url
        : (sink.argv[0] ?? 'agent')
  const ttlSec = typeof args.ttlSec === 'number' ? args.ttlSec : undefined
  const subscription = subscriptions(options).subscribe({
    id,
    label,
    sink,
    ...(filter ? { filter } : {}),
    ...(ttlSec !== undefined ? { ttlSec } : {}),
    allowRemoteCallback: options.allowRemoteCallback === true,
  })
  options.onAgentsChanged?.()
  return {
    subscriptionId: subscription.id,
    label: subscription.label,
    expiresAt: subscription.expiresAt,
    ...(sink.type === 'webhook' ? { secret: sink.secret } : {}),
  }
}

function parseSink(value: unknown): AgentSink {
  if (!value || typeof value !== 'object') {
    throw new LiveError('invalid_argument', 'subscribe_agent_requests needs sink')
  }
  const sink = value as { type?: unknown; url?: unknown; secret?: unknown; argv?: unknown }
  if (sink.type === 'webhook') {
    if (typeof sink.url !== 'string' || !sink.url) {
      throw new LiveError('invalid_argument', 'webhook sink needs url')
    }
    const secret =
      typeof sink.secret === 'string' && sink.secret
        ? sink.secret
        : crypto.randomUUID().replace(/-/g, '')
    return { type: 'webhook', url: sink.url, secret }
  }
  if (sink.type === 'command') {
    if (!Array.isArray(sink.argv) || sink.argv.some((part) => typeof part !== 'string')) {
      throw new LiveError('invalid_argument', 'command sink needs argv: string[]')
    }
    return { type: 'command', argv: sink.argv }
  }
  throw new LiveError('invalid_argument', 'sink.type must be webhook or command')
}

function parseFilter(value: unknown): AgentSubscriptionFilter | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object') {
    throw new LiveError('invalid_argument', 'filter must be an object')
  }
  const raw = value as { families?: unknown; paths?: unknown; kinds?: unknown }
  const filter: AgentSubscriptionFilter = {}
  if (raw.families !== undefined) filter.families = stringList(raw.families) as EditorFamilyList
  if (raw.paths !== undefined) filter.paths = stringList(raw.paths)
  if (raw.kinds !== undefined) {
    const kinds = stringList(raw.kinds)
    for (const kind of kinds) {
      if (!(AGENT_REQUEST_KINDS as readonly string[]).includes(kind)) {
        throw new LiveError('invalid_argument', `unknown agent request kind ${kind}`)
      }
    }
    filter.kinds = kinds as AgentRequestKind[]
  }
  return filter
}

type EditorFamilyList = AgentSubscriptionFilter['families']

function stringList(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new LiveError('invalid_argument', 'filter lists must be string arrays')
  }
  return value
}

function publicSubscription(subscription: {
  id: string
  label: string
  sink: AgentSink
  expiresAt: number | null
  filter?: AgentSubscriptionFilter
}) {
  return {
    subscriptionId: subscription.id,
    label: subscription.label,
    sink: subscription.sink.type,
    expiresAt: subscription.expiresAt,
    ...(subscription.filter ? { filter: subscription.filter } : {}),
  }
}

function requests(options: AgentToolOptions): AgentRequestStore {
  if (!options.requests) throw new LiveError('unsupported', 'agent requests are not enabled')
  return options.requests
}

function subscriptions(options: AgentToolOptions): AgentSubscriptions {
  if (!options.subscriptions) {
    throw new LiveError('unsupported', 'agent subscriptions are not enabled')
  }
  return options.subscriptions
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value) {
    throw new LiveError('invalid_argument', `missing ${key}`)
  }
  return value
}

function statusArg(value: unknown): AgentRequestStatus {
  if (typeof value === 'string' && (AGENT_REQUEST_STATUSES as readonly string[]).includes(value)) {
    return value as AgentRequestStatus
  }
  throw new LiveError('invalid_argument', 'status must be a known agent request status')
}
