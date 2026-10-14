/**
 * Snapshot and track-changes state for edits that belong to one agent request.
 * Design: docs/agent-extension.md
 */
import type { Editor } from '@tiptap/core'
import type { AiTrack } from './protocol'

const AI_REVISION_AUTHOR = 'AI Assistant'
const snapshots = new Map<string, unknown>()
let trackChanges = false

export function setExternalTrack(on: boolean): void {
  trackChanges = on
}

export function externalTrack(): AiTrack | undefined {
  return trackChanges ? { author: AI_REVISION_AUTHOR } : undefined
}

export function rememberSnapshot(editor: Editor, requestId: string): void {
  if (!requestId || snapshots.has(requestId)) return
  snapshots.set(requestId, editor.getJSON())
}

export function hasSnapshot(requestId: string): boolean {
  return snapshots.has(requestId)
}

export function restoreSnapshot(editor: Editor, requestId: string): boolean {
  const snapshot = snapshots.get(requestId)
  if (!snapshot) return false
  editor
    .chain()
    .setContent(snapshot as never)
    .run()
  snapshots.delete(requestId)
  return true
}
