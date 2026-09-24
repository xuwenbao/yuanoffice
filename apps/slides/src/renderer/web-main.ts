import {
  ControlLink,
  ServiceFiles,
  installFrameChild,
  postCloseResult,
  postDocState,
} from '@genoffice/platform-web'

const params = new URLSearchParams(location.search)
const path = params.get('path') ?? ''
const editorId = params.get('editorId') || `slides-${Math.random().toString(36).slice(2, 10)}`

/**
 * Browser slides host. It does not import pptx-engine: document operations
 * still live in the Electron main process. The page registers so a command
 * is answered here instead of falling through to a disk write.
 */
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
    if (root) root.textContent = 'Open a presentation from the shell.'
    return
  }
  const bytes = await files.read(path)
  const title = path.split(/[/\\]/).pop() || path
  if (root) root.textContent = `${title} (${bytes.byteLength} bytes)`
  link.publish({ editorId, path, family: 'slides', title, revision: 0, dirty: false })
  postDocState({ title, dirty: false, path })
  installFrameChild({
    onCloseCheck(requestId) {
      postCloseResult('close-check-result', requestId, false)
    },
    onCloseSave(requestId) {
      postCloseResult('close-save-result', requestId, true)
    },
  })
  link.onCommand((command) => {
    if (command.command === 'read_document') {
      link.reportResult({
        requestId: command.requestId,
        ok: true,
        result: { title, bytes: bytes.byteLength },
      })
      return
    }
    link.reportResult({
      requestId: command.requestId,
      ok: false,
      error: 'unsupported',
    })
  })
}

void main()
