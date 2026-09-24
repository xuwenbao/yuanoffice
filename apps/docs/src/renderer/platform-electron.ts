import type { AgentControlPort, DocumentRef } from '@genoffice/platform'
import type { DesktopApi } from '../shared/ipc'
import type { DocsPlatform } from './platform'

/** Desktop adapter. This module is the one that reads window.desktop. */
export function createElectronDocsPlatform(): DocsPlatform {
  const api: DesktopApi = window.desktop
  const agentControl: AgentControlPort = {
    onCommand(handler) {
      return api.onMcpCommand((message) =>
        handler({
          requestId: message.requestId,
          command: message.command,
          payload: message.payload,
        }),
      )
    },
    reportResult(result) {
      api.reportMcpResult({
        requestId: result.requestId,
        ok: result.ok,
        ...(result.result !== undefined ? { result: result.result } : {}),
        ...(result.error !== undefined ? { error: result.error } : {}),
      })
    },
    publish() {
      api.signalMcpReady()
    },
    close() {},
  }
  return {
    api,
    ai: { enabled: true },
    agentControl,
    download: null,
    file: {
      async read(_ref: DocumentRef) {
        throw new Error('desktop file reads go through api.openDocx')
      },
      async save(ref, data) {
        const result = await api.saveDocx(ref.path, data)
        return { ok: result.ok, path: ref.path, ...(result.error ? { error: result.error } : {}) }
      },
    },
  }
}
