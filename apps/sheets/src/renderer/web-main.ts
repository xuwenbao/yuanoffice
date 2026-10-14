import { ControlLink, ServiceFiles } from '@genoffice/platform-web'

const params = new URLSearchParams(location.search)
const path = params.get('path') ?? ''
const editorId = params.get('editorId') || `sheets-${Math.random().toString(36).slice(2, 10)}`

async function main(): Promise<void> {
  await fetch('/api/session', { credentials: 'same-origin' })
  const files = new ServiceFiles('')
  const link = new ControlLink(
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
    '',
  )
  link.start('editor')
  const root = document.getElementById('root')
  if (!path) {
    if (root) root.textContent = 'Open a workbook from the shell.'
    return
  }
  const bytes = await files.read(path)
  const title = path.split(/[/\\]/).pop() || path
  if (root) root.textContent = `${title} (${bytes.byteLength} bytes)`
  link.publish({ editorId, path, family: 'sheets', title, revision: 0, dirty: false })
  link.onCommand((command) => {
    if (command.command === 'read_document' || command.command === 'read_selection') {
      link.reportResult({
        requestId: command.requestId,
        ok: true,
        result: { title, bytes: bytes.byteLength, note: 'cell edits need the wasm reactor' },
      })
      return
    }
    if (command.command === 'replace_selection' || command.command === 'apply_sheet_ops') {
      link.reportResult({
        requestId: command.requestId,
        ok: false,
        reason: 'unsupported',
        error: 'sheets cell edits are not available until the wasm reactor is built',
      })
      return
    }
    link.reportResult({
      requestId: command.requestId,
      ok: false,
      reason: 'unsupported',
      error: 'unsupported',
    })
  })
}

void main()
