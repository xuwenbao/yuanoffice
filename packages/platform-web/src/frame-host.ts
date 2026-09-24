import {
  FRAME_PROTOCOL,
  parseFrameToShell,
  type FrameToShellMessage,
} from './frame-wire.js'

export interface FrameRecord {
  id: string
  window: Window
}

export interface FrameHost {
  /** Bind a live iframe window to its id. Messages from any other window are dropped. */
  register(id: string, win: Window): void
  unregister(id: string): void
  send(id: string, message: { kind: string; requestId: string; path?: string }): void
  onMessage(handler: (message: FrameToShellMessage) => void): () => void
  stop(): void
}

export function installFrameHost(expectedOrigin: string): FrameHost {
  const frames = new Map<string, Window>()
  const handlers = new Set<(message: FrameToShellMessage) => void>()
  const onMessage = (event: MessageEvent): void => {
    const parsed = parseFrameToShell(
      { origin: event.origin, data: event.data },
      expectedOrigin,
    )
    if (!parsed) return
    const expected = frames.get(parsed.frameId)
    if (!expected || event.source !== expected) return
    for (const handler of handlers) handler(parsed)
  }
  window.addEventListener('message', onMessage)
  return {
    register(id, win) {
      frames.set(id, win)
    },
    unregister(id) {
      frames.delete(id)
    },
    send(id, message) {
      const win = frames.get(id)
      if (!win) return
      win.postMessage({ protocol: FRAME_PROTOCOL, ...message }, expectedOrigin)
    },
    onMessage(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    stop() {
      window.removeEventListener('message', onMessage)
      frames.clear()
      handlers.clear()
    },
  }
}
