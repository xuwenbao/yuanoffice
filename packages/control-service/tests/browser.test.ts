import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import { afterEach, describe, expect, it } from 'vitest'
import { startControlService, type ControlService } from '../src/server'

const services: ControlService[] = []
afterEach(async () => {
  while (services.length) await services.pop()!.close()
})

describe('browser editor', () => {
  it('shows an apply on the page before the file changes', async () => {
    const root = join(tmpdir(), `genoffice-browser-${Date.now()}`)
    const userData = join(tmpdir(), `genoffice-browser-data-${Date.now()}`)
    mkdirSync(root)
    mkdirSync(userData)
    const file = join(root, 'a.docx')
    writeFileSync(file, 'original')
    const service = await startControlService({ port: 0, roots: [root], userData })
    services.push(service)
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.goto(`${service.url}/api/session`)
      await page.goto(
        `${service.url}/harness/editor.html?path=${encodeURIComponent(file)}&editorId=e1&text=original`,
      )
      await page.waitForFunction("document.getElementById('doc')?.textContent === 'original'")
      const applied = await fetch(`${service.url}/mcp`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${service.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'insert_content', arguments: { document: file, html: '!' } },
        }),
      })
      const body = (await applied.json()) as { result: { content: Array<{ text: string }> } }
      expect(JSON.parse(body.result.content[0]!.text).persisted).toBe(false)
      await page.waitForFunction("document.getElementById('doc')?.textContent === 'original!'")
      expect(readFileSync(file, 'utf8')).toBe('original')
    } finally {
      await browser.close()
    }
  })

  it('wakes a webhook from AI 修改 and applies replace_selection without writing the file', async () => {
    const hits: Array<{ body: { type?: string; requestId?: string }; signature: string }> = []
    const hook = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      req.on('end', () => {
        hits.push({
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as { type?: string },
          signature: String(req.headers['x-genoffice-signature'] ?? ''),
        })
        res.end('ok')
      })
    })
    await new Promise<void>((resolve) => hook.listen(0, '127.0.0.1', () => resolve()))
    const hookPort = (hook.address() as { port: number }).port
    const root = join(tmpdir(), `genoffice-agent-${Date.now()}`)
    const userData = join(tmpdir(), `genoffice-agent-data-${Date.now()}`)
    mkdirSync(root)
    mkdirSync(userData)
    const file = join(root, 'a.docx')
    writeFileSync(file, 'original')
    const service = await startControlService({ port: 0, roots: [root], userData })
    services.push(service)
    const headers = {
      authorization: `Bearer ${service.token}`,
      'content-type': 'application/json',
    }
    const call = async (name: string, args: Record<string, unknown>) => {
      const response = await fetch(`${service.url}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      })
      const body = (await response.json()) as {
        result: { isError?: boolean; content: Array<{ text: string }> }
      }
      return JSON.parse(body.result.content[0]!.text) as Record<string, unknown>
    }
    const subscribed = await call('subscribe_agent_requests', {
      sink: { type: 'webhook', url: `http://127.0.0.1:${hookPort}/hook`, secret: 'test-secret' },
    })
    expect(subscribed.secret).toBe('test-secret')
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.goto(`${service.url}/api/session`)
      await page.goto(
        `${service.url}/harness/editor.html?path=${encodeURIComponent(file)}&editorId=e1&text=original`,
      )
      await page.waitForFunction("document.getElementById('status')?.textContent === 'ready'")
      await page.click('#ask')
      await page.waitForFunction("document.getElementById('status')?.textContent === 'accepted'")
      for (let i = 0; i < 20 && hits.length === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      expect(hits[0]?.body.type).toBe('request.created')
      expect(hits[0]?.body.requestId).toBe('req-harness')
      expect(hits[0]?.signature.startsWith('sha256=')).toBe(true)
      expect(JSON.stringify(hits[0]?.body)).not.toContain('original')
      const claimed = await call('claim_agent_request', { requestId: 'req-harness', agent: 'test' })
      expect(claimed.request).toMatchObject({ status: 'claimed' })
      const replaced = await call('replace_selection', {
        document: file,
        requestId: 'req-harness',
        html: 'shorter',
        expectedText: 'original',
      })
      expect(replaced.persisted).toBe(false)
      await page.waitForFunction("document.getElementById('doc')?.textContent === 'shorter'")
      expect(readFileSync(file, 'utf8')).toBe('original')
      const done = await call('complete_agent_request', {
        requestId: 'req-harness',
        status: 'done',
        summary: 'shortened',
      })
      expect(done.request).toMatchObject({ status: 'done' })
      await page.waitForFunction(
        "document.getElementById('status')?.textContent === 'done: shortened'",
      )
    } finally {
      await browser.close()
      await new Promise<void>((resolve) => hook.close(() => resolve()))
    }
  })
})
