import type { OpenedPptx, Slide } from '@genoffice/pptx-engine'

/**
 * Deck session record, shared by the Electron main process and the browser
 * host. Open, render, text, transform, and save live in document.ts.
 */
export interface OpLogEntry {
  seq: number
  source: 'edit' | 'batch' | 'script' | 'generate' | 'reset'
  ops: Array<{ op: { op: string; [k: string]: unknown }; slideId?: string; created?: string[] }>
}

export interface HistorySnapshot {
  slides: Slide[]
  entries: Map<string, Uint8Array>
  size: { cx: number; cy: number }
  metaDirty: boolean
}

export interface Session {
  path: string
  opened: OpenedPptx
  fitWidthPx: number
  undoStack: HistorySnapshot[]
  redoStack: HistorySnapshot[]
  historyBatch?: {
    depth: number
    undoStart: number
    before: HistorySnapshot
  }
  aiSnapshots?: Map<number, HistorySnapshot>
  metaDirty?: boolean
  transformPreview?: boolean
  masterEdit?: { partPath: string; slide: Slide } | null
  historyNotifyScheduled?: boolean
  deckBroadcastScheduled?: boolean
  opSeq?: number
  opLog?: OpLogEntry[]
}

export const sessions = new Map<number, Session>()
