/** What an editor reports so the control service can route a command. */
export interface LiveEditorState {
  editorId: string
  path: string
  family: 'docs' | 'pdf' | 'slides' | 'sheets'
  title: string
  revision: number
  dirty: boolean
}

export interface AgentCommand {
  requestId: string
  command: string
  payload: unknown
}

export type AgentRequestKind = 'edit_selection' | 'queue_batch' | 'chat'

/** What the editor asks an external agent to do. Targets are family-specific. */
export interface AgentSubmit {
  requestId: string
  kind: AgentRequestKind
  instruction: string
  targets: unknown[]
}

export interface AgentUiEvent {
  requestId: string
  event: 'accepted' | 'rejected' | 'claimed' | 'message' | 'done' | 'failed' | 'cancelled'
  text?: string
  summary?: string
  reason?: string
  error?: string
  claimedBy?: string
}

export interface AgentsInfo {
  count: number
  labels: string[]
}

export interface AgentControlPort {
  /** Subscribe to commands aimed at this editor. Returns unsubscribe. */
  onCommand(handler: (command: AgentCommand) => void): () => void
  reportResult(result: {
    requestId: string
    ok: boolean
    result?: unknown
    error?: string
    reason?: string
  }): void
  /** Announce that the editor can accept commands, and keep state current. */
  publish(state: LiveEditorState): void
  /** Drop the registration. `dirty: false` releases the file immediately. */
  close(editorId: string, dirty: boolean): void
  /** Hand an agent request to the control service, which wakes subscribed agents. */
  submitRequest(request: AgentSubmit): void
  cancelRequest(requestId: string): void
  onAgentEvent(handler: (event: AgentUiEvent) => void): () => void
  onAgentsChanged(handler: (info: AgentsInfo) => void): () => void
}
