/**
 * Replaceable agent backend for the AI edit action and the AI panel.
 * `builtin` keeps the in-app AgentLoop. `external` forwards the request to a
 * subscribed agent and does not call a model from this app.
 * Design: docs/agent-extension.md
 */
import type { Editor } from '@tiptap/core'
import type { AgentSubmit, AgentUiEvent } from '@genoffice/platform'
import type { ExternalAgentPort } from '../platform'
import { addQueueAnchor } from '../editor/ai-queue-anchors'

export type AiRunKind = 'edit_selection' | 'queue_batch' | 'chat'

export interface DocsAgentTarget {
  family: 'docs'
  anchorId: string
  blocks: [number, number]
  text: string
}

export interface AiRunRequest {
  kind: AiRunKind
  instruction: string
  targets: DocsAgentTarget[]
}

export interface AiBackend {
  readonly kind: 'builtin' | 'external'
  submit(request: AiRunRequest): string
  cancel(requestId: string): void
  onEvent(handler: (event: AgentUiEvent) => void): () => void
}

export function createBuiltinBackend(run: (request: AiRunRequest) => void): AiBackend {
  return {
    kind: 'builtin',
    submit(request) {
      const requestId = crypto.randomUUID()
      run(request)
      return requestId
    },
    cancel() {},
    onEvent() {
      return () => {}
    },
  }
}

export function createExternalBackend(port: ExternalAgentPort): AiBackend {
  return {
    kind: 'external',
    submit(request) {
      const requestId = crypto.randomUUID()
      const body: AgentSubmit = {
        requestId,
        kind: request.kind,
        instruction: request.instruction,
        targets: request.targets,
      }
      port.submit(body)
      return requestId
    },
    cancel(requestId) {
      port.cancel(requestId)
    },
    onEvent(handler) {
      return port.onEvent(handler)
    },
  }
}

/** Anchor the live selection and describe it for an agent request. */
export function targetFromSelection(editor: Editor, anchorId: string): DocsAgentTarget | null {
  const { from, to, empty } = editor.state.selection
  if (empty || from >= to) return null
  addQueueAnchor(editor, anchorId, from, to)
  const blocks = blockRange(editor, from, to)
  const text = editor.state.doc
    .textBetween(from, to, ' ', ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
  return { family: 'docs', anchorId, blocks, text }
}

export function blockRange(editor: Editor, from: number, to: number): [number, number] {
  let start = -1
  let end = -1
  let index = 0
  editor.state.doc.forEach((node, offset) => {
    if (offset + node.nodeSize > from && offset < to) {
      if (start === -1) start = index
      end = index
    }
    index += 1
  })
  if (start === -1) {
    const last = Math.max(0, editor.state.doc.childCount - 1)
    return [last, last]
  }
  return [start, end]
}
