/**
 * docs platform slot. Renderer code reaches the host through docsPlatform(),
 * never through window.desktop. host-electron.ts is the module that reads the
 * preload global.
 */
import {
  createPlatformSlot,
  type AgentControlPort,
  type AgentSubmit,
  type AgentUiEvent,
  type AgentsInfo,
  type DocumentRef,
} from '@genoffice/platform'
import type { DesktopApi } from '../shared/ipc'
import { createElectronDocsPlatform } from './platform-electron'

/**
 * Desktop keeps the in-app agent (`builtin`). The browser host uses `external`:
 * AI actions become agent requests for a subscribed external agent.
 * Design: docs/agent-extension.md
 */
export type DocsAiPort = { kind: 'builtin' } | { kind: 'external'; requests: ExternalAgentPort }

export interface ExternalAgentPort {
  submit(request: AgentSubmit): void
  cancel(requestId: string): void
  onEvent(handler: (event: AgentUiEvent) => void): () => void
  onAgents(handler: (info: AgentsInfo) => void): () => void
}

export interface DocsFilePort {
  read(ref: DocumentRef): Promise<{ data: ArrayBuffer; name: string; hash: string }>
  /** Write bytes back to the document's own path. */
  save(ref: DocumentRef, data: ArrayBuffer): Promise<{ ok: boolean; path: string; error?: string }>
}

export interface DocsPlatform {
  api: DesktopApi
  ai: DocsAiPort | null
  agentControl: AgentControlPort | null
  file: DocsFilePort
  /** Browser host can hand bytes to the user without adopting a path. Desktop writes real files. */
  download:
    | ((name: string, data: ArrayBuffer) => Promise<{ ok: boolean; name?: string; error?: string }>)
    | null
}

const slot = createPlatformSlot<DocsPlatform>('docs')

let explicit = false

export function setDocsPlatform(platform: DocsPlatform): void {
  explicit = true
  slot.set(platform)
}

export function resetDocsPlatform(): void {
  explicit = false
  slot.reset()
}

/**
 * Explicit web/electron install wins. Tests that stub window.desktop and never
 * call setDocsPlatform get a fresh desktop adapter on each read.
 */
export function docsPlatform(): DocsPlatform {
  if (explicit) return slot.get()
  return createElectronDocsPlatform()
}
