import type {
  AgentCommand,
  AgentSubmit,
  AgentUiEvent,
  AgentsInfo,
  LiveEditorState,
} from '@genoffice/platform'

type ServerMessage =
  | { type: 'welcome' }
  | { type: 'command'; requestId: string; editorId: string; command: string; payload: unknown }
  | { type: 'open'; path: string; editorId: string }
  | { type: 'focus'; editorId: string }
  | ({ type: 'agent_event' } & AgentUiEvent)
  | ({ type: 'agents' } & AgentsInfo)

/**
 * WebSocket client for one editor page or the shell.
 * Reconnects with backoff and re-sends the last registration.
 */
export class ControlLink {
  private socket: WebSocket | null = null
  private state: LiveEditorState | null = null
  private role: 'editor' | 'shell' = 'editor'
  private attempt = 0
  private closed = false
  private commandHandler: ((command: AgentCommand) => void) | null = null
  private openHandler: ((path: string, editorId: string) => void) | null = null
  private focusHandler: ((editorId: string) => void) | null = null
  private readonly agentEventHandlers = new Set<(event: AgentUiEvent) => void>()
  private readonly agentsHandlers = new Set<(info: AgentsInfo) => void>()

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  start(role: 'editor' | 'shell'): void {
    this.role = role
    this.closed = false
    this.connect()
  }

  stop(): void {
    this.closed = true
    this.socket?.close()
    this.socket = null
  }

  onCommand(handler: (command: AgentCommand) => void): () => void {
    this.commandHandler = handler
    return () => {
      if (this.commandHandler === handler) this.commandHandler = null
    }
  }

  onOpen(handler: (path: string, editorId: string) => void): () => void {
    this.openHandler = handler
    return () => {
      if (this.openHandler === handler) this.openHandler = null
    }
  }

  onFocus(handler: (editorId: string) => void): () => void {
    this.focusHandler = handler
    return () => {
      if (this.focusHandler === handler) this.focusHandler = null
    }
  }

  publish(state: LiveEditorState): void {
    this.state = state
    this.send({ type: 'register', ...state })
  }

  update(state: Pick<LiveEditorState, 'editorId' | 'revision' | 'dirty' | 'title'>): void {
    if (this.state && this.state.editorId === state.editorId) {
      this.state = { ...this.state, ...state }
    }
    this.send({ type: 'state', ...state })
  }

  reportResult(result: {
    requestId: string
    ok: boolean
    result?: unknown
    error?: string
    reason?: string
  }): void {
    this.send({ type: 'result', ...result })
  }

  closeEditor(editorId: string, dirty: boolean): void {
    this.send({ type: 'unregister', editorId, dirty })
    if (this.state?.editorId === editorId) this.state = null
  }

  submitRequest(request: AgentSubmit): void {
    this.send({
      type: 'agent_request',
      editorId: this.state?.editorId,
      ...request,
    })
  }

  cancelRequest(requestId: string): void {
    this.send({ type: 'agent_cancel', requestId })
  }

  onAgentEvent(handler: (event: AgentUiEvent) => void): () => void {
    this.agentEventHandlers.add(handler)
    return () => this.agentEventHandlers.delete(handler)
  }

  onAgentsChanged(handler: (info: AgentsInfo) => void): () => void {
    this.agentsHandlers.add(handler)
    return () => this.agentsHandlers.delete(handler)
  }

  private connect(): void {
    if (this.closed) return
    const socket = new WebSocket(this.url)
    this.socket = socket
    socket.addEventListener('open', () => {
      this.attempt = 0
      this.send({ type: 'hello', role: this.role, token: this.token })
      if (this.state) this.send({ type: 'register', ...this.state })
    })
    socket.addEventListener('message', (event) => {
      let message: ServerMessage
      try {
        message = JSON.parse(String(event.data)) as ServerMessage
      } catch {
        return
      }
      if (message.type === 'command') {
        this.commandHandler?.({
          requestId: message.requestId,
          command: message.command,
          payload: message.payload,
        })
      } else if (message.type === 'open') {
        this.openHandler?.(message.path, message.editorId)
      } else if (message.type === 'focus') {
        this.focusHandler?.(message.editorId)
      } else if (message.type === 'agent_event') {
        for (const handler of this.agentEventHandlers) handler(message)
      } else if (message.type === 'agents') {
        for (const handler of this.agentsHandlers) {
          handler({ count: message.count, labels: message.labels })
        }
      }
    })
    socket.addEventListener('close', () => {
      if (this.socket === socket) this.socket = null
      if (this.closed) return
      const delay = Math.min(1000 * 2 ** this.attempt, 8000)
      this.attempt += 1
      setTimeout(() => this.connect(), delay)
    })
  }

  private send(message: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message))
    }
  }
}
