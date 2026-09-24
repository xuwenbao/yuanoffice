import {
  ControlLink,
  ServiceFiles,
  installFrameChild,
  postCloseResult,
  postDocState,
} from '@genoffice/platform-web'
import { readPdfiumText } from './pdfium-read'

const params = new URLSearchParams(location.search)
const path = params.get('path') ?? ''
const editorId = params.get('editorId') || `pdf-${Math.random().toString(36).slice(2, 10)}`
let dirty = false

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
    if (root) root.textContent = 'Open a PDF from the shell.'
    return
  }
  const bytes = await files.read(path)
  const text = await readPdfiumText(bytes)
  if (root) root.textContent = text.text || `(${text.pageCount} pages, no text layer)`
  link.publish({
    editorId,
    path,
    family: 'pdf',
    title: path.split(/[/\\]/).pop() || path,
    revision: 0,
    dirty: false,
  })
  postDocState({ title: path.split(/[/\\]/).pop() || path, dirty: false, path })
  installFrameChild({
    onCloseCheck(requestId) {
      postCloseResult('close-check-result', requestId, dirty)
    },
    onCloseSave(requestId) {
      postCloseResult('close-save-result', requestId, !dirty)
    },
  })
  link.onCommand((command) => {
    if (command.command === 'read_pdf' || command.command === 'read_document') {
      link.reportResult({ requestId: command.requestId, ok: true, result: text })
      return
    }
    if (command.command === 'save_document') {
      link.reportResult({
        requestId: command.requestId,
        ok: true,
        result: { ok: true, bytesBase64: bytesToBase64(bytes) },
      })
      dirty = false
      return
    }
    link.reportResult({
      requestId: command.requestId,
      ok: false,
      error: 'unsupported',
    })
  })
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

void main()
