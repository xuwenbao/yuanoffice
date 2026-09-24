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
      await page.waitForFunction(() => document.getElementById('doc')?.textContent === 'original')
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
      await page.waitForFunction(() => document.getElementById('doc')?.textContent === 'original!')
      expect(readFileSync(file, 'utf8')).toBe('original')
    } finally {
      await browser.close()
    }
  })
})
