import { createIpcTransport, type AgentTransport } from '@genoffice/agent-core'
import type { AiSettings } from '@genoffice/ai-provider'
import { t } from '../i18n/locale'
import { sheetsPlatform } from '../platform'

/** The shared IPC transport wired to the sheets preload bridge (sheetsPlatform().api). */
export function createElectronTransport(getSettings: () => AiSettings): AgentTransport {
  return createIpcTransport<AiSettings>({
    onStream: (listener) => sheetsPlatform().api.onAiStream(listener),
    start: (request) => sheetsPlatform().api.aiStream(request),
    cancel: (requestId) => void sheetsPlatform().api.aiStreamCancel(requestId),
    getSettings,
    unknownErrorText: () => t('aiUnknownError'),
    timeoutErrorText: () => t('aiTimeoutError'),
    creditsErrorText: () => t('aiCreditsExhausted'),
    networkErrorText: () => t('aiNetworkError'),
    overloadedErrorText: () => t('aiOverloadedError'),
  })
}
