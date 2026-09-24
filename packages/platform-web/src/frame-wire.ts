/** postMessage contract between the web shell and the editor frames it hosts. */

export const FRAME_PROTOCOL = 'genoffice.shell.frame.v1'
export const FRAME_ID_PARAM = 'shellFrame'

export type ShellToFrameMessage =
  | { protocol: typeof FRAME_PROTOCOL; kind: 'close-check'; requestId: string }
  | { protocol: typeof FRAME_PROTOCOL; kind: 'close-save'; requestId: string }
  | { protocol: typeof FRAME_PROTOCOL; kind: 'focus-request'; requestId: string }
  | { protocol: typeof FRAME_PROTOCOL; kind: 'open-path'; requestId: string; path: string }

export type FrameToShellMessage =
  | { protocol: typeof FRAME_PROTOCOL; kind: 'ready'; frameId: string }
  | {
      protocol: typeof FRAME_PROTOCOL
      kind: 'close-check-result'
      frameId: string
      requestId: string
      dirty: boolean
    }
  | {
      protocol: typeof FRAME_PROTOCOL
      kind: 'close-save-result'
      frameId: string
      requestId: string
      ok: boolean
    }
  | {
      protocol: typeof FRAME_PROTOCOL
      kind: 'doc-state'
      frameId: string
      title: string
      dirty: boolean
      path: string
    }

export interface FrameMessageLike {
  origin: string
  data: unknown
}

function originAllowed(origin: string, expectedOrigin: string): boolean {
  return origin !== 'null' && origin === expectedOrigin
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function tagged(data: unknown): data is Record<string, unknown> {
  return isRecord(data) && data.protocol === FRAME_PROTOCOL
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function parseFrameToShell(
  event: FrameMessageLike,
  expectedOrigin: string,
): FrameToShellMessage | null {
  if (!originAllowed(event.origin, expectedOrigin)) return null
  const data = event.data
  if (!tagged(data) || !nonEmpty(data.frameId)) return null
  switch (data.kind) {
    case 'ready':
      return { protocol: FRAME_PROTOCOL, kind: 'ready', frameId: data.frameId }
    case 'close-check-result':
      if (!nonEmpty(data.requestId) || typeof data.dirty !== 'boolean') return null
      return {
        protocol: FRAME_PROTOCOL,
        kind: 'close-check-result',
        frameId: data.frameId,
        requestId: data.requestId,
        dirty: data.dirty,
      }
    case 'close-save-result':
      if (!nonEmpty(data.requestId) || typeof data.ok !== 'boolean') return null
      return {
        protocol: FRAME_PROTOCOL,
        kind: 'close-save-result',
        frameId: data.frameId,
        requestId: data.requestId,
        ok: data.ok,
      }
    case 'doc-state':
      if (typeof data.title !== 'string' || typeof data.dirty !== 'boolean') return null
      if (typeof data.path !== 'string') return null
      return {
        protocol: FRAME_PROTOCOL,
        kind: 'doc-state',
        frameId: data.frameId,
        title: data.title,
        dirty: data.dirty,
        path: data.path,
      }
    default:
      return null
  }
}

export function parseShellToFrame(
  event: FrameMessageLike,
  expectedOrigin: string,
): ShellToFrameMessage | null {
  if (!originAllowed(event.origin, expectedOrigin)) return null
  const data = event.data
  if (!tagged(data) || !nonEmpty(data.requestId)) return null
  switch (data.kind) {
    case 'close-check':
      return { protocol: FRAME_PROTOCOL, kind: 'close-check', requestId: data.requestId }
    case 'close-save':
      return { protocol: FRAME_PROTOCOL, kind: 'close-save', requestId: data.requestId }
    case 'focus-request':
      return { protocol: FRAME_PROTOCOL, kind: 'focus-request', requestId: data.requestId }
    case 'open-path':
      if (!nonEmpty(data.path)) return null
      return {
        protocol: FRAME_PROTOCOL,
        kind: 'open-path',
        requestId: data.requestId,
        path: data.path,
      }
    default:
      return null
  }
}
