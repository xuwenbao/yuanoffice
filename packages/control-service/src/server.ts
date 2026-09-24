import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer as createHttp, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createNet, type Server as NetServer } from 'node:net'
import { basename, extname, join } from 'node:path'
import { isAbsolute, relative, resolve } from 'node:path'
import { CONTROL_FILE, CONTROL_PROTOCOL, type ControlReply, type ControlRequest } from '@genoffice/cli/control-protocol'
import {
  dispatchLiveTool,
  EditorRegistry,
  LiveError,
  liveToolDefinitions,
  type EditorFamily,
} from '@genoffice/editor-control'
import { WebSocket, WebSocketServer } from 'ws'
import { resolveAllowed, type AllowedRoots } from './allowed.js'
import { atomicWriteFile } from './atomic-write.js'
import { blankBytes, blankKind } from './blanks.js'

export interface ControlServiceOptions {
  /** Loopback port. 0 picks a free port. */
  port?: number
  roots: string[]
  /** Directory that receives control.json, the socket, and open-documents.json. */
  userData: string
  /** Built web shell. Omitted in tests that only exercise the API. */
  staticDir?: string
  leaseMs?: number
}

export interface ControlService {
  port: number
  token: string
  url: string
  close(): Promise<void>
}

interface Pending {
  editorId: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

const FAMILIES = new Set<EditorFamily>(['docs', 'pdf', 'slides', 'sheets'])

export async function startControlService(options: ControlServiceOptions): Promise<ControlService> {
  const allowed = resolveAllowed(options.roots)
  const registry = new EditorRegistry(options.leaseMs ?? 15_000)
  const token = randomBytes(24).toString('hex')
  const sockets = new Map<string, WebSocket>()
  const shells = new Set<WebSocket>()
  const pending = new Map<string, Pending>()
  mkdirSync(options.userData, { recursive: true })

  const http = createHttp((req, res) => {
    void handleHttp(req, res, {
      token,
      allowed,
      registry,
      staticDir: options.staticDir,
      publish: () => publish(options.userData, registry),
    }).catch((error) => sendJson(res, 500, { error: 'internal', message: errorMessage(error) }))
  })

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject)
    http.listen(options.port ?? 0, '127.0.0.1', () => {
      http.removeListener('error', reject)
      resolve()
    })
  })
  const address = http.address()
  if (!address || typeof address === 'string') throw new Error('control service failed to bind')
  const port = address.port
  const url = `http://127.0.0.1:${port}`

  const wss = new WebSocketServer({ noServer: true })
  http.on('upgrade', (req, socket, head) => {
    if (!authorized(req, token, port) || !loopbackHost(req, port)) {
      socket.destroy()
      return
    }
    const upgradeUrl = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (upgradeUrl.pathname !== '/ws') {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      onSocket(ws, registry, sockets, shells, pending, () => publish(options.userData, registry)),
    )
  })

  const net = await listenControlSocket(options.userData, token, (request) =>
    controlCommand(request, registry, allowed, shells),
  )
  publish(options.userData, registry)
  const lease = setInterval(() => {
    registry.expire()
    publish(options.userData, registry)
  }, 1_000)
  lease.unref?.()

  return {
    port,
    token,
    url,
    async close() {
      clearInterval(lease)
      for (const entry of pending.values()) {
        clearTimeout(entry.timer)
        entry.reject(new LiveError('editor_disconnected', 'control service stopped'))
      }
      pending.clear()
      wss.close()
      net.close()
      await new Promise<void>((resolve) => http.close(() => resolve()))
      for (const name of [CONTROL_FILE, 'open-documents.json']) {
        try {
          unlinkSync(join(options.userData, name))
        } catch {
          /* already gone */
        }
      }
      try {
        unlinkSync(controlSocketPath(options.userData))
      } catch {
        /* already gone */
      }
    },
  }
}

function onSocket(
  ws: WebSocket,
  registry: EditorRegistry,
  sockets: Map<string, WebSocket>,
  shells: Set<WebSocket>,
  pending: Map<string, Pending>,
  publishNow: () => void,
): void {
  let editorId: string | null = null
  ws.on('message', (raw) => {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(String(raw)) as Record<string, unknown>
    } catch {
      return
    }
    if (message.type === 'hello' && message.role === 'shell') {
      shells.add(ws)
      return
    }
    if (message.type === 'register' && typeof message.editorId === 'string') {
      editorId = message.editorId
      const family = message.family
      if (typeof family !== 'string' || !FAMILIES.has(family as EditorFamily)) return
      if (typeof message.path !== 'string') return
      sockets.set(editorId, ws)
      registry.register({
        editorId,
        path: message.path,
        family: family as EditorFamily,
        title: typeof message.title === 'string' ? message.title : basename(message.path),
        revision: typeof message.revision === 'number' ? message.revision : 0,
        dirty: message.dirty === true,
        run: (command, payload) => callEditor(editorId!, command, payload, sockets, shells, pending),
      })
      publishNow()
    } else if (message.type === 'state' && typeof message.editorId === 'string') {
      registry.update(message.editorId, {
        ...(typeof message.revision === 'number' ? { revision: message.revision } : {}),
        ...(typeof message.dirty === 'boolean' ? { dirty: message.dirty } : {}),
        ...(typeof message.title === 'string' ? { title: message.title } : {}),
      })
    } else if (message.type === 'result' && typeof message.requestId === 'string') {
      const entry = pending.get(message.requestId)
      if (!entry) return
      pending.delete(message.requestId)
      clearTimeout(entry.timer)
      if (message.ok === true) entry.resolve(message.result)
      else entry.reject(new Error(typeof message.error === 'string' ? message.error : 'command failed'))
    } else if (message.type === 'unregister' && typeof message.editorId === 'string') {
      registry.unregister(message.editorId, message.dirty === true)
      sockets.delete(message.editorId)
      publishNow()
    }
  })
  ws.on('close', () => {
    shells.delete(ws)
    if (!editorId) return
    sockets.delete(editorId)
    registry.markDisconnected(editorId)
    publishNow()
    for (const [requestId, entry] of pending) {
      if (entry.editorId !== editorId) continue
      pending.delete(requestId)
      clearTimeout(entry.timer)
      entry.reject(new LiveError('editor_disconnected', 'the page closed'))
    }
  })
}

const MUTATING = new Set([
  'insert_content',
  'replace_blocks',
  'apply_ops',
  'apply_sheet_ops',
  'apply_slide_ops',
])

function callEditor(
  editorId: string,
  command: string,
  payload: unknown,
  sockets: Map<string, WebSocket>,
  shells: Set<WebSocket>,
  pending: Map<string, Pending>,
): Promise<unknown> {
  const socket = sockets.get(editorId)
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return Promise.reject(new LiveError('editor_disconnected', 'the page is gone'))
  }
  if (MUTATING.has(command)) {
    const focus = JSON.stringify({ type: 'focus', editorId })
    for (const shell of shells) {
      if (shell.readyState === WebSocket.OPEN) shell.send(focus)
    }
  }
  const requestId = randomBytes(8).toString('hex')
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new LiveError('editor_disconnected', 'the editor did not answer'))
    }, 30_000)
    pending.set(requestId, { editorId, resolve, reject, timer })
    socket.send(JSON.stringify({ type: 'command', requestId, editorId, command, payload }))
  })
}

interface HttpCtx {
  token: string
  allowed: AllowedRoots
  registry: EditorRegistry
  staticDir?: string
  publish: () => void
}

async function handleHttp(req: IncomingMessage, res: ServerResponse, ctx: HttpCtx): Promise<void> {
  const port = hostPort(req)
  if (!loopbackHost(req, port)) {
    sendJson(res, 403, { error: 'forbidden', message: 'loopback only' })
    return
  }
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/api/session') {
    if (!originOk(req, port)) {
      sendJson(res, 403, { error: 'forbidden', message: 'origin rejected' })
      return
    }
    res.setHeader('set-cookie', `genoffice_token=${ctx.token}; HttpOnly; SameSite=Strict; Path=/`)
    sendJson(res, 200, { ok: true })
    return
  }
  if (url.pathname.startsWith('/api/') || url.pathname === '/mcp') {
    if (!authorized(req, ctx.token, port)) {
      sendJson(res, 401, { error: 'unauthorized', message: 'missing token' })
      return
    }
  }
  if (url.pathname === '/api/files/list' && req.method === 'GET') {
    const raw = url.searchParams.get('path') ?? ''
    if (raw === '') {
      sendJson(res, 200, {
        entries: ctx.allowed.roots.map((root) => fileEntry(root, basename(root) || root, 'dir')),
      })
      return
    }
    const dir = ctx.allowed.resolve(raw)
    const entries = readdirSync(dir, { withFileTypes: true }).map((entry) =>
      fileEntry(join(dir, entry.name), entry.name, entry.isDirectory() ? 'dir' : 'file'),
    )
    sendJson(res, 200, { entries })
    return
  }
  if (url.pathname === '/api/files/stat' && req.method === 'GET') {
    const path = ctx.allowed.resolve(url.searchParams.get('path') ?? '')
    if (!existsSync(path)) {
      sendJson(res, 404, { error: 'not_found', message: 'file not found' })
      return
    }
    const stat = statSync(path)
    sendJson(res, 200, fileEntry(path, basename(path) || path, stat.isDirectory() ? 'dir' : 'file'))
    return
  }
  if (url.pathname === '/api/files/create' && req.method === 'POST') {
    const dir = ctx.allowed.resolve(url.searchParams.get('dir') ?? '')
    const name = url.searchParams.get('name') ?? ''
    if (!name || name !== basename(name) || name === '.' || name === '..') {
      sendJson(res, 400, { error: 'invalid_argument', message: 'name must be a single path segment' })
      return
    }
    const kind = blankKind(name)
    if (!kind) {
      sendJson(res, 400, { error: 'invalid_argument', message: 'unsupported document type' })
      return
    }
    const path = ctx.allowed.resolve(join(dir, name))
    if (existsSync(path)) {
      sendJson(res, 409, { error: 'exists', message: `file exists: ${path}` })
      return
    }
    await atomicWriteFile(path, await blankBytes(kind))
    sendJson(res, 200, fileEntry(path, name, 'file'))
    return
  }
  if (url.pathname === '/api/files/read' && req.method === 'GET') {
    const path = ctx.allowed.resolve(url.searchParams.get('path') ?? '')
    const bytes = readFileSync(path)
    res.setHeader('content-type', 'application/octet-stream')
    res.setHeader('x-sha256', createHash('sha256').update(bytes).digest('hex'))
    res.end(bytes)
    return
  }
  if (url.pathname === '/api/files/write' && req.method === 'PUT') {
    const path = ctx.allowed.resolve(url.searchParams.get('path') ?? '')
    const overwrite = url.searchParams.get('overwrite') === '1'
    if (existsSync(path) && !overwrite) {
      sendJson(res, 409, { error: 'exists', message: `file exists: ${path}` })
      return
    }
    const body = await readBody(req)
    await atomicWriteFile(path, body)
    sendJson(res, 200, { ok: true, path, sha256: createHash('sha256').update(body).digest('hex') })
    return
  }
  if (url.pathname === '/mcp' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8')) as {
      id?: unknown
      method?: unknown
      params?: { name?: unknown; arguments?: unknown }
    }
    const response = await mcpResponse(body, ctx)
    if (response) sendJson(res, 200, response)
    else res.end()
    ctx.publish()
    return
  }
  if (url.pathname === '/harness/editor.html') {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(HARNESS)
    return
  }
  if (ctx.staticDir && req.method === 'GET') {
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '')
    const file = staticFile(ctx.staticDir, rel)
    if (!file) {
      sendJson(res, 403, { error: 'forbidden' })
      return
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      sendJson(res, 404, { error: 'not_found' })
      return
    }
    res.setHeader('content-type', contentType(file))
    createReadStream(file).pipe(res)
    return
  }
  sendJson(res, 404, { error: 'not_found' })
}

async function mcpResponse(
  body: { id?: unknown; method?: unknown; params?: { name?: unknown; arguments?: unknown } },
  ctx: HttpCtx,
): Promise<Record<string, unknown> | null> {
  const id = body.id ?? null
  const method = String(body.method ?? '')
  if (method === 'notifications/initialized') return null
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'genoffice-control', version: '0.1.0' },
      },
    }
  }
  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: liveToolDefinitions().map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: { type: 'object', additionalProperties: true },
        })),
      },
    }
  }
  if (method === 'tools/call') {
    const name = String(body.params?.name ?? '')
    const args = (body.params?.arguments ?? {}) as Record<string, unknown>
    try {
      const result = await dispatchLiveTool(ctx.registry, name, args, {
        save: (session, path, overwrite) => saveEditor(session, path, overwrite, ctx.allowed),
      })
      return {
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: JSON.stringify(result) }] },
      }
    } catch (error) {
      const reason = error instanceof LiveError ? error.reason : 'unsupported'
      const message = errorMessage(error)
      return {
        jsonrpc: '2.0',
        id,
        result: {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ error: reason, message }) }],
        },
      }
    }
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `unknown method ${method}` } }
}

async function saveEditor(
  session: { run: (command: 'save_document', payload: unknown) => Promise<unknown>; path: string },
  path: string,
  overwrite: boolean,
  allowed: AllowedRoots,
): Promise<{ path: string }> {
  const abs = allowed.resolve(path)
  if (existsSync(abs) && !overwrite) {
    throw new LiveError('invalid_argument', `file exists: ${abs}; pass overwrite true`)
  }
  const outcome = (await session.run('save_document', { path: abs, overwrite })) as {
    bytesBase64?: string
    ok?: boolean
  }
  if (outcome && typeof outcome.bytesBase64 === 'string') {
    await atomicWriteFile(abs, Buffer.from(outcome.bytesBase64, 'base64'))
    return { path: abs }
  }
  if (outcome?.ok === true) return { path: abs }
  throw new LiveError('unsupported', 'the editor did not save')
}

function publicDocuments(registry: EditorRegistry): Array<Record<string, unknown>> {
  return registry.list().map((session) => ({
    editorId: session.editorId,
    path: session.path,
    family: session.family,
    title: session.title,
    revision: session.revision,
    dirty: session.dirty,
    connected: session.connected,
    savedRevision: session.savedRevision,
    lastSavedAt: session.lastSavedAt,
  }))
}

function applyTool(family: EditorFamily): 'apply_ops' | 'apply_sheet_ops' | 'apply_slide_ops' {
  if (family === 'sheets') return 'apply_sheet_ops'
  if (family === 'slides') return 'apply_slide_ops'
  return 'apply_ops'
}

async function controlCommand(
  request: ControlRequest,
  registry: EditorRegistry,
  allowed: AllowedRoots,
  shells: Set<WebSocket>,
): Promise<ControlReply> {
  try {
    if (request.cmd === 'open') {
      if (shells.size === 0) {
        return {
          ok: false,
          error: { reason: 'app_unavailable', message: 'the browser shell is not connected' },
        }
      }
      const editorId = createHash('sha1').update(request.path).digest('hex').slice(0, 12)
      const body = JSON.stringify({ type: 'open', path: request.path, editorId })
      for (const shell of shells) {
        if (shell.readyState === WebSocket.OPEN) shell.send(body)
      }
      return { ok: true, result: { opened: true, path: request.path, editorId } }
    }
    if (request.cmd === 'editor-list') {
      return { ok: true, result: { documents: publicDocuments(registry) } }
    }
    if (
      request.cmd !== 'editor-read' &&
      request.cmd !== 'editor-apply' &&
      request.cmd !== 'editor-status' &&
      request.cmd !== 'editor-save'
    ) {
      return {
        ok: false,
        error: { reason: 'unsupported', message: 'genoffice serve handles editor commands only' },
      }
    }
    const session = registry.resolve(request.doc)
    const tool =
      request.cmd === 'editor-read'
        ? 'read_document'
        : request.cmd === 'editor-apply'
          ? applyTool(session.family)
          : request.cmd === 'editor-status'
            ? 'document_status'
            : 'save_document'
    const result = await dispatchLiveTool(
      registry,
      tool,
      {
        document: request.doc,
        ...(request.cmd === 'editor-apply' ? { ops: request.ops, baseRevision: request.baseRevision } : {}),
        ...(request.cmd === 'editor-save' ? { path: request.path, overwrite: request.overwrite } : {}),
      },
      { save: (session, path, overwrite) => saveEditor(session, path, overwrite, allowed) },
    )
    return { ok: true, result }
  } catch (error) {
    const reason = error instanceof LiveError ? error.reason : 'unsupported'
    return {
      ok: false,
      error: {
        reason: reason as 'unsupported',
        message: errorMessage(error),
      },
    }
  }
}

function publish(userData: string, registry: EditorRegistry): void {
  const body = {
    pid: process.pid,
    updatedAt: new Date().toISOString(),
    source: 'control-service',
    paths: [...new Set(registry.paths())].sort(),
  }
  writeFileSync(join(userData, 'open-documents.json'), JSON.stringify(body))
}

function listenControlSocket(
  userData: string,
  token: string,
  handler: (request: ControlRequest) => Promise<ControlReply>,
): Promise<NetServer> {
  const endpoint = controlSocketPath(userData)
  if (process.platform !== 'win32') {
    try {
      unlinkSync(endpoint)
    } catch {
      /* no previous socket */
    }
  }
  const server = createNet((socket) => {
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk) => {
      buffer += chunk
      const nl = buffer.indexOf('\n')
      if (nl < 0) return
      let parsed: { token?: string; request?: ControlRequest }
      try {
        parsed = JSON.parse(buffer.slice(0, nl)) as { token?: string; request?: ControlRequest }
      } catch {
        socket.destroy()
        return
      }
      if (!parsed.token || !tokenEquals(parsed.token, token) || !parsed.request) {
        socket.destroy()
        return
      }
      void handler(parsed.request).then(
        (reply) => socket.end(JSON.stringify(reply) + '\n'),
        (error) =>
          socket.end(
            JSON.stringify({
              ok: false,
              error: { reason: 'app_unavailable', message: errorMessage(error) },
            }) + '\n',
          ),
      )
    })
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(endpoint, () => {
      server.removeListener('error', reject)
      if (process.platform !== 'win32') {
        try {
          writeFileSync(endpoint, '', { flag: 'a' })
        } catch {
          /* socket path is not a regular file */
        }
      }
      writeFileSync(
        join(userData, CONTROL_FILE),
        JSON.stringify({
          protocol: CONTROL_PROTOCOL,
          pid: process.pid,
          endpoint,
          token,
          role: 'web',
        }),
        { mode: 0o600 },
      )
      resolve(server)
    })
  })
}

function controlSocketPath(userData: string): string {
  if (process.platform === 'win32') {
    const hash = createHash('sha1').update(userData).digest('hex').slice(0, 16)
    return `\\\\.\\pipe\\genoffice-web-${hash}`
  }
  return join(userData, 'control.sock')
}

function tokenEquals(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function authorized(req: IncomingMessage, token: string, port: number): boolean {
  if (!originOk(req, port)) return false
  const header = req.headers.authorization
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return tokenEquals(header.slice('Bearer '.length), token)
  }
  const cookie = req.headers.cookie ?? ''
  const match = /(?:^|;\s*)genoffice_token=([^;]+)/.exec(cookie)
  return match !== null && tokenEquals(decodeURIComponent(match[1] ?? ''), token)
}

function loopbackHost(req: IncomingMessage, port: number): boolean {
  const host = req.headers.host ?? ''
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`
}

function originOk(req: IncomingMessage, port: number): boolean {
  const origin = req.headers.origin
  if (!origin) return true
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`
}

function hostPort(req: IncomingMessage): number {
  const host = req.headers.host ?? ''
  const port = Number(host.split(':')[1])
  return Number.isInteger(port) ? port : 80
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function contentType(file: string): string {
  switch (extname(file)) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

function staticFile(root: string, rel: string): string | null {
  const base = resolve(root)
  const file = resolve(base, rel)
  const relPath = relative(base, file)
  if (relPath.startsWith('..') || isAbsolute(relPath)) return null
  return file
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function fileEntry(path: string, name: string, kind: 'file' | 'dir') {
  let mtimeMs = 0
  let sizeBytes = 0
  try {
    const stat = statSync(path)
    mtimeMs = stat.mtimeMs
    sizeBytes = stat.isDirectory() ? 0 : stat.size
  } catch {
    /* a root can be listed before it exists */
  }
  return { name, path, kind, mtimeMs, sizeBytes }
}

const HARNESS = `<!doctype html>
<meta charset="utf-8">
<title>Harness</title>
<div id="doc"></div>
<script>
const params = new URLSearchParams(location.search)
const editorId = params.get('editorId') || 'harness'
const path = params.get('path') || ''
let revision = 0
let dirty = false
let text = params.get('text') || 'hello'
document.getElementById('doc').textContent = text
const token = document.cookie.split('; ').find((p) => p.startsWith('genoffice_token='))?.split('=')[1]
const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws')
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ type: 'hello', role: 'editor', token }))
  ws.send(JSON.stringify({ type: 'register', editorId, path, family: 'docs', title: path.split('/').pop(), revision, dirty }))
})
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.type !== 'command') return
  try {
    let result = {}
    if (message.command === 'read_document') result = { text }
    else if (message.command === 'insert_content' || message.command === 'apply_ops') {
      text += String(message.payload?.html || message.payload?.text || ' edited')
      revision += 1
      dirty = true
      document.getElementById('doc').textContent = text
      result = { summary: 'edited', bytes: text }
    } else if (message.command === 'save_document') {
      result = { bytesBase64: btoa(text) }
      dirty = false
    } else if (message.command === 'document_status') result = { dirty, revision }
    ws.send(JSON.stringify({ type: 'state', editorId, revision, dirty, title: path.split('/').pop() }))
    ws.send(JSON.stringify({ type: 'result', requestId: message.requestId, ok: true, result }))
  } catch (error) {
    ws.send(JSON.stringify({ type: 'result', requestId: message.requestId, ok: false, error: String(error) }))
  }
})
</script>
`
