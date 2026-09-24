import {
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { resolveAllowed } from '../src/allowed'
import { startControlService, type ControlService } from '../src/server'

const services: ControlService[] = []
afterEach(async () => {
  while (services.length) await services.pop()!.close()
})

function temp(): string {
  const dir = join(tmpdir(), `genoffice-svc-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(dir)
  return dir
}

describe('allowed roots', () => {
  it('rejects a symlink that points outside the root', () => {
    const root = temp()
    const outside = temp()
    const secret = join(outside, 'secret.txt')
    writeFileSync(secret, 'nope')
    symlinkSync(secret, join(root, 'link.txt'))
    const allowed = resolveAllowed([root])
    expect(() => allowed.resolve(join(root, 'link.txt'))).toThrow(/outside_allowed_roots/)
  })
})

describe('control service', () => {
  it('round-trips a docx and refuses a path outside the root', async () => {
    const root = temp()
    const userData = temp()
    const src = join(root, 'simple.docx')
    const fixture = readFileSync(
      join(import.meta.dirname, '../../../fixtures/generated/simple.docx'),
    )
    writeFileSync(src, fixture)
    const service = await startControlService({ port: 0, roots: [root], userData })
    services.push(service)
    const headers = { authorization: `Bearer ${service.token}` }
    const read = await fetch(`${service.url}/api/files/read?path=${encodeURIComponent(src)}`, {
      headers,
    })
    expect(read.status).toBe(200)
    const bytes = Buffer.from(await read.arrayBuffer())
    expect(bytes.subarray(0, 2).toString()).toBe('PK')
    expect(bytes.equals(fixture)).toBe(true)
    const copy = join(root, 'copy.docx')
    const write = await fetch(
      `${service.url}/api/files/write?path=${encodeURIComponent(copy)}&overwrite=0`,
      { method: 'PUT', headers, body: bytes },
    )
    expect(write.status).toBe(200)
    expect(readFileSync(copy).equals(fixture)).toBe(true)
    const escaped = await fetch(
      `${service.url}/api/files/read?path=${encodeURIComponent(join(root, '..', 'nope.docx'))}`,
      { headers },
    )
    expect(escaped.status).toBe(500)
  })

  it('lists the allowed root when the path is empty', async () => {
    const root = realpathSync(temp())
    const userData = temp()
    const service = await startControlService({ port: 0, roots: [root], userData })
    services.push(service)
    const listed = await fetch(`${service.url}/api/files/list?path=`, {
      headers: { authorization: `Bearer ${service.token}` },
    })
    expect(listed.status).toBe(200)
    const body = (await listed.json()) as {
      entries: Array<{
        name: string
        path: string
        kind: string
        mtimeMs: number
        sizeBytes: number
      }>
    }
    expect(body.entries[0]).toMatchObject({
      name: basename(root),
      path: root,
      kind: 'dir',
      sizeBytes: 0,
    })
    expect(body.entries[0]?.mtimeMs).toBeGreaterThan(0)
  })

  it('creates a blank document inside the root', async () => {
    const root = realpathSync(temp())
    const service = await startControlService({ port: 0, roots: [root], userData: temp() })
    services.push(service)
    const headers = { authorization: `Bearer ${service.token}` }
    const created = await fetch(
      `${service.url}/api/files/create?dir=${encodeURIComponent(root)}&name=${encodeURIComponent('未命名.docx')}`,
      { method: 'POST', headers },
    )
    expect(created.status).toBe(200)
    const entry = (await created.json()) as { path: string; sizeBytes: number }
    expect(entry.path).toBe(join(root, '未命名.docx'))
    expect(entry.sizeBytes).toBe(statSync(entry.path).size)
    expect(readFileSync(entry.path).subarray(0, 2).toString()).toBe('PK')
  })

  it('applies an edit in the page without touching the file, then saves', async () => {
    const root = temp()
    const userData = temp()
    const file = join(root, 'a.docx')
    writeFileSync(file, 'original')
    const service = await startControlService({ port: 0, roots: [root], userData })
    services.push(service)
    const headers = { authorization: `Bearer ${service.token}` }
    await fetch(`${service.url}/api/session`)
    const ws = new WebSocket(`${service.url.replace('http', 'ws')}/ws`, {
      headers: { host: `127.0.0.1:${service.port}`, authorization: `Bearer ${service.token}` },
    })
    await new Promise((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })
    ws.send(
      JSON.stringify({
        type: 'register',
        editorId: 'e1',
        path: file,
        family: 'docs',
        title: 'a.docx',
        revision: 0,
        dirty: false,
      }),
    )
    ws.on('message', (raw) => {
      const message = JSON.parse(String(raw)) as {
        type: string
        requestId?: string
        command?: string
        payload?: { html?: string }
      }
      if (message.type !== 'command' || !message.requestId) return
      if (message.command === 'insert_content') {
        ws.send(
          JSON.stringify({
            type: 'state',
            editorId: 'e1',
            revision: 1,
            dirty: true,
            title: 'a.docx',
          }),
        )
        ws.send(
          JSON.stringify({
            type: 'result',
            requestId: message.requestId,
            ok: true,
            result: { summary: 'inserted' },
          }),
        )
      } else if (message.command === 'save_document') {
        ws.send(
          JSON.stringify({
            type: 'result',
            requestId: message.requestId,
            ok: true,
            result: { bytesBase64: Buffer.from('edited').toString('base64'), ok: true },
          }),
        )
      }
    })
    await new Promise((r) => setTimeout(r, 50))
    const applied = await fetch(`${service.url}/mcp`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'insert_content', arguments: { document: file, html: '<p>x</p>' } },
      }),
    })
    const appliedBody = (await applied.json()) as { result: { content: Array<{ text: string }> } }
    const appliedJson = JSON.parse(appliedBody.result.content[0]!.text) as { persisted: boolean }
    expect(appliedJson.persisted).toBe(false)
    expect(readFileSync(file, 'utf8')).toBe('original')
    const saved = await fetch(`${service.url}/mcp`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'save_document', arguments: { document: file } },
      }),
    })
    const savedBody = (await saved.json()) as { result: { content: Array<{ text: string }> } }
    expect(JSON.parse(savedBody.result.content[0]!.text)).toMatchObject({ persisted: true })
    expect(readFileSync(file, 'utf8')).toBe('edited')
    ws.close()
    await new Promise((r) => setTimeout(r, 30))
    const gone = await fetch(`${service.url}/mcp`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'read_document', arguments: { document: file } },
      }),
    })
    const goneBody = (await gone.json()) as {
      result: { isError?: boolean; content: Array<{ text: string }> }
    }
    expect(goneBody.result.isError).toBe(true)
    expect(goneBody.result.content[0]!.text).toContain('editor_disconnected')
  })
})
