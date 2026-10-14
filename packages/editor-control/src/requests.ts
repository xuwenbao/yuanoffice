/**
 * In-memory agent requests created by an open editor.
 * Design: docs/agent-extension.md
 */
import type { EditorFamily } from './names.js'
import { LiveError } from './registry.js'

export const AGENT_REQUEST_KINDS = ['edit_selection', 'queue_batch', 'chat'] as const
export type AgentRequestKind = (typeof AGENT_REQUEST_KINDS)[number]

export const AGENT_REQUEST_STATUSES = ['pending', 'claimed', 'done', 'failed', 'cancelled'] as const
export type AgentRequestStatus = (typeof AGENT_REQUEST_STATUSES)[number]

/** Stable reasons a live tool or agent request can fail with. */
export const LIVE_ERROR_REASONS = [
  'editor_disconnected',
  'unsaved_changes',
  'revision_conflict',
  'file_open_in_gui',
  'file_not_found',
  'unsupported',
  'invalid_argument',
  'target_not_found',
  'no_agent_subscribed',
  'request_not_found',
  'request_cancelled',
  'request_claimed',
  'selection_changed',
] as const

export type LiveErrorReason = (typeof LIVE_ERROR_REASONS)[number]

export type AgentTarget =
  | { family: 'docs'; anchorId: string; blocks: [number, number]; text: string }
  | { family: 'slides'; slide: number; elements: string[]; text?: string }
  | { family: 'sheets'; sheet: string; range: string; text?: string }
  | { family: 'pdf'; page: number; text: string }

export interface AgentRequest {
  requestId: string
  editorId: string
  path: string
  family: EditorFamily
  kind: AgentRequestKind
  instruction: string
  targets: AgentTarget[]
  revisionAtCreate: number
  status: AgentRequestStatus
  claimedBy?: string
  summary?: string
  createdAt: string
}

export type AgentRequestEvent =
  | { type: 'created'; request: AgentRequest }
  | { type: 'claimed'; request: AgentRequest }
  | { type: 'message'; request: AgentRequest; text: string }
  | { type: 'completed'; request: AgentRequest }
  | { type: 'cancelled'; request: AgentRequest }

/** Callback body. Document text stays on the MCP read; the hook only wakes the agent. */
export interface AgentCallbackBody {
  type: 'request.created' | 'request.cancelled'
  requestId: string
  editorId: string
  path: string
  family: EditorFamily
  kind: AgentRequestKind
  instructionPreview: string
  targetCount: number
}

export function callbackBody(event: AgentRequestEvent): AgentCallbackBody | null {
  if (event.type !== 'created' && event.type !== 'cancelled') return null
  return {
    type: event.type === 'created' ? 'request.created' : 'request.cancelled',
    requestId: event.request.requestId,
    editorId: event.request.editorId,
    path: event.request.path,
    family: event.request.family,
    kind: event.request.kind,
    instructionPreview: event.request.instruction.slice(0, 160),
    targetCount: event.request.targets.length,
  }
}

export interface SubmitAgentRequest {
  requestId: string
  editorId: string
  path: string
  family: EditorFamily
  kind: AgentRequestKind
  instruction: string
  targets: AgentTarget[]
  revisionAtCreate: number
  createdAt?: string
}

/**
 * Requests live only in memory. Status moves forward: pending → claimed →
 * done or failed, and pending or claimed → cancelled. Nothing moves backward.
 */
export class AgentRequestStore {
  private readonly requests = new Map<string, AgentRequest>()
  private readonly listeners = new Set<(event: AgentRequestEvent) => void>()

  on(listener: (event: AgentRequestEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  submit(input: SubmitAgentRequest): AgentRequest {
    if (this.requests.has(input.requestId)) {
      throw new LiveError('invalid_argument', `agent request ${input.requestId} already exists`)
    }
    if (!(AGENT_REQUEST_KINDS as readonly string[]).includes(input.kind)) {
      throw new LiveError('invalid_argument', `unknown agent request kind ${input.kind}`)
    }
    if (typeof input.instruction !== 'string' || !input.instruction.trim()) {
      throw new LiveError('invalid_argument', 'agent request needs an instruction')
    }
    const request: AgentRequest = {
      requestId: input.requestId,
      editorId: input.editorId,
      path: input.path,
      family: input.family,
      kind: input.kind,
      instruction: input.instruction,
      targets: input.targets,
      revisionAtCreate: input.revisionAtCreate,
      status: 'pending',
      createdAt: input.createdAt ?? new Date().toISOString(),
    }
    this.requests.set(request.requestId, request)
    this.emit({ type: 'created', request })
    return request
  }

  get(requestId: string): AgentRequest {
    const request = this.requests.get(requestId)
    if (!request) throw new LiveError('request_not_found', `no agent request ${requestId}`)
    return request
  }

  list(status?: AgentRequestStatus): AgentRequest[] {
    const all = [...this.requests.values()]
    return status ? all.filter((request) => request.status === status) : all
  }

  claim(requestId: string, claimedBy: string): AgentRequest {
    const request = this.get(requestId)
    if (request.status === 'cancelled') {
      throw new LiveError('request_cancelled', `agent request ${requestId} was cancelled`)
    }
    if (request.status !== 'pending') {
      throw new LiveError('request_claimed', `agent request ${requestId} is ${request.status}`)
    }
    request.status = 'claimed'
    request.claimedBy = claimedBy
    this.emit({ type: 'claimed', request })
    return request
  }

  message(requestId: string, text: string): AgentRequest {
    const request = this.open(requestId)
    if (!text.trim()) throw new LiveError('invalid_argument', 'post_agent_message needs text')
    this.emit({ type: 'message', request, text })
    return request
  }

  complete(requestId: string, status: 'done' | 'failed', summary: string): AgentRequest {
    const request = this.open(requestId)
    if (status !== 'done' && status !== 'failed') {
      throw new LiveError(
        'invalid_argument',
        'complete_agent_request status must be done or failed',
      )
    }
    request.status = status
    request.summary = summary
    this.emit({ type: 'completed', request })
    return request
  }

  /** Cancelling a finished request is a no-op so a late cancel cannot reopen it. */
  cancel(requestId: string): AgentRequest {
    const request = this.get(requestId)
    if (
      request.status === 'done' ||
      request.status === 'failed' ||
      request.status === 'cancelled'
    ) {
      return request
    }
    request.status = 'cancelled'
    this.emit({ type: 'cancelled', request })
    return request
  }

  cancelEditor(editorId: string): void {
    for (const request of this.requests.values()) {
      if (request.editorId !== editorId) continue
      if (request.status === 'pending' || request.status === 'claimed')
        this.cancel(request.requestId)
    }
  }

  private open(requestId: string): AgentRequest {
    const request = this.get(requestId)
    if (request.status === 'cancelled') {
      throw new LiveError('request_cancelled', `agent request ${requestId} was cancelled`)
    }
    if (request.status === 'done' || request.status === 'failed') {
      throw new LiveError(
        'request_claimed',
        `agent request ${requestId} is already ${request.status}`,
      )
    }
    if (request.status !== 'claimed') {
      throw new LiveError('invalid_argument', `claim agent request ${requestId} before updating it`)
    }
    return request
  }

  private emit(event: AgentRequestEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}
