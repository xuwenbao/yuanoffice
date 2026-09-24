import type { EditorFamily } from './names.js'
import type { EditorSession } from './session.js'

export interface RegisterInput {
  editorId: string
  path: string
  family: EditorFamily
  title: string
  revision: number
  dirty: boolean
  run: EditorSession['run']
}

/**
 * Open editors, keyed by editor id. A disconnect keeps the row for `leaseMs`
 * so a background write still sees the file as open.
 */
export class EditorRegistry {
  private readonly sessions = new Map<string, EditorSession>()

  constructor(private readonly leaseMs = 15_000) {}

  register(input: RegisterInput): EditorSession {
    const previous = this.sessions.get(input.editorId)
    const session: EditorSession = {
      editorId: input.editorId,
      path: input.path,
      family: input.family,
      title: input.title,
      revision: input.revision,
      dirty: input.dirty,
      savedRevision: previous?.savedRevision ?? input.revision,
      lastSavedAt: previous?.lastSavedAt ?? null,
      connected: true,
      leaseUntil: null,
      run: input.run,
    }
    this.sessions.set(input.editorId, session)
    return session
  }

  update(
    editorId: string,
    patch: Partial<Pick<EditorSession, 'revision' | 'dirty' | 'title' | 'savedRevision' | 'lastSavedAt'>>,
  ): void {
    const session = this.sessions.get(editorId)
    if (!session) return
    Object.assign(session, patch)
  }

  markDisconnected(editorId: string, now = Date.now()): void {
    const session = this.sessions.get(editorId)
    if (!session) return
    session.connected = false
    session.leaseUntil = now + this.leaseMs
  }

  /** Drop a clean close immediately. A dirty close keeps the lease. */
  unregister(editorId: string, dirty: boolean, now = Date.now()): void {
    if (!dirty) {
      this.sessions.delete(editorId)
      return
    }
    this.markDisconnected(editorId, now)
    const session = this.sessions.get(editorId)
    if (session) session.dirty = true
  }

  expire(now = Date.now()): void {
    for (const [id, session] of this.sessions) {
      if (!session.connected && session.leaseUntil !== null && session.leaseUntil <= now) {
        this.sessions.delete(id)
      }
    }
  }

  list(): EditorSession[] {
    return [...this.sessions.values()]
  }

  paths(): string[] {
    return this.list().map((session) => session.path)
  }

  resolve(target: string): EditorSession {
    const byId = this.sessions.get(target)
    if (byId) return byId
    const byPath = this.list().filter((session) => session.path === target)
    if (byPath.length === 1) return byPath[0]!
    if (byPath.length > 1) {
      throw new LiveError(
        'target_not_found',
        `more than one open editor matches ${target}`,
        byPath.map((session) => session.editorId),
      )
    }
    const byTitle = this.list().filter((session) => session.title === target)
    if (byTitle.length === 1) return byTitle[0]!
    if (byTitle.length > 1) {
      throw new LiveError(
        'target_not_found',
        `more than one open editor is named ${target}`,
        byTitle.map((session) => session.editorId),
      )
    }
    throw new LiveError('file_not_found', `no open editor matches ${target}`, this.list().map((s) => s.editorId))
  }
}

export class LiveError extends Error {
  constructor(
    readonly reason: string,
    message: string,
    readonly candidates: string[] = [],
  ) {
    super(message)
  }
}
