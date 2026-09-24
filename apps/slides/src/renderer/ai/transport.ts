import { createIpcTransport, type AgentTransport } from '@genoffice/agent-core'
import type { AiSettings } from '../../shared/ipc'
import { t } from '../i18n/locale'
import { slidesPlatform } from '../platform'

/** The shared IPC transport wired to the slides preload bridge (slidesPlatform().api). */
export function createElectronTransport(getSettings: () => AiSettings): AgentTransport {
  return createIpcTransport<AiSettings>({
    onStream: (listener) => slidesPlatform().api.onAiStream(listener),
    start: (request) => slidesPlatform().api.aiStream(request),
    cancel: (requestId) => void slidesPlatform().api.aiStreamCancel(requestId),
    getSettings,
    unknownErrorText: () => t('aiErrUnknown'),
    timeoutErrorText: () => t('aiErrStreamTimeout'),
    creditsErrorText: () => t('aiCreditsExhausted'),
    networkErrorText: () => t('aiErrNetwork'),
    overloadedErrorText: () => t('aiErrOverloaded'),
  })
}
