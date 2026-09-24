import { docsPlatform } from '../platform'
import { createIpcTransport, type AgentTransport } from '@genoffice/agent-core'
import type { AiSettings } from '../../shared/ipc'
import { t } from '../i18n/locale'

/** The shared IPC transport wired to the docs preload bridge (docsPlatform().api). */
export function createElectronTransport(getSettings: () => AiSettings): AgentTransport {
  return createIpcTransport<AiSettings>({
    onStream: (listener) => docsPlatform().api.onAiStream(listener),
    start: (request) => docsPlatform().api.aiStream(request),
    cancel: (requestId) => void docsPlatform().api.aiStreamCancel(requestId),
    getSettings,
    unknownErrorText: () => t('aiUnknownError'),
    timeoutErrorText: () => t('aiTimeoutError'),
    creditsErrorText: () => t('aiCreditsExhausted'),
    networkErrorText: () => t('aiNetworkError'),
    overloadedErrorText: () => t('aiOverloadedError'),
  })
}
