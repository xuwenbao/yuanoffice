import {
  FRAME_ID_PARAM,
  FRAME_PROTOCOL,
  parseShellToFrame,
  type ShellToFrameMessage,
} from './frame-wire.js'

export interface FrameChildHandlers {
  onCloseCheck?: (requestId: string) => void
  onCloseSave?: (requestId: string) => void
  onFocus?: (requestId: string) => void
  onOpenPath?: (requestId: string, path: string) => void
}

/** Install the frame client when this page was opened with `?shellFrame=<id>`. */
export function installFrameChild(handlers: FrameChildHandlers): () => void {
  const frameId = new URLSearchParams(window.location.search).get(FRAME_ID_PARAM)
  if (!frameId) return () => {}
  const origin = window.location.origin
  const onMessage = (event: MessageEvent): void => {
    if (event.source !== window.parent) return
    const parsed = parseShellToFrame({ origin: event.origin, data: event.data }, origin)
    if (!parsed) return
    dispatch(parsed, handlers)
  }
  window.addEventListener('message', onMessage)
  window.parent.postMessage({ protocol: FRAME_PROTOCOL, kind: 'ready', frameId }, origin)
  return () => window.removeEventListener('message', onMessage)
}

function dispatch(message: ShellToFrameMessage, handlers: FrameChildHandlers): void {
  switch (message.kind) {
    case 'close-check':
      handlers.onCloseCheck?.(message.requestId)
      return
    case 'close-save':
      handlers.onCloseSave?.(message.requestId)
      return
    case 'focus-request':
      handlers.onFocus?.(message.requestId)
      return
    case 'open-path':
      handlers.onOpenPath?.(message.requestId, message.path)
      return
    default: {
      const unreachable: never = message
      void unreachable
    }
  }
}

export function postDocState(state: { title: string; dirty: boolean; path: string }): void {
  const frameId = new URLSearchParams(window.location.search).get(FRAME_ID_PARAM)
  if (!frameId) return
  window.parent.postMessage(
    { protocol: FRAME_PROTOCOL, kind: 'doc-state', frameId, ...state },
    window.location.origin,
  )
}

export function postCloseResult(
  kind: 'close-check-result' | 'close-save-result',
  requestId: string,
  value: boolean,
): void {
  const frameId = new URLSearchParams(window.location.search).get(FRAME_ID_PARAM)
  if (!frameId) return
  const body =
    kind === 'close-check-result'
      ? { protocol: FRAME_PROTOCOL, kind, frameId, requestId, dirty: value }
      : { protocol: FRAME_PROTOCOL, kind, frameId, requestId, ok: value }
  window.parent.postMessage(body, window.location.origin)
}
