import type { EditorFamily, LiveCommandName } from './names.js'

export interface EditorSession {
  editorId: string
  path: string
  family: EditorFamily
  title: string
  revision: number
  dirty: boolean
  savedRevision: number
  lastSavedAt: string | null
  connected: boolean
  /** When a disconnected session is dropped. Null while connected. */
  leaseUntil: number | null
  run(command: LiveCommandName, payload: unknown): Promise<unknown>
}

export interface EditorDirectory {
  list(): EditorSession[]
  /** editor id, then canonical path, then tab id. Ambiguous names throw. */
  resolve(target: string): EditorSession
}
