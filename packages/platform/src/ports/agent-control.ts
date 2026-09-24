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

export interface AgentControlPort {
  /** Subscribe to commands aimed at this editor. Returns unsubscribe. */
  onCommand(handler: (command: AgentCommand) => void): () => void
  reportResult(result: { requestId: string; ok: boolean; result?: unknown; error?: string }): void
  /** Announce that the editor can accept commands, and keep state current. */
  publish(state: LiveEditorState): void
  /** Drop the registration. `dirty: false` releases the file immediately. */
  close(editorId: string, dirty: boolean): void
}
