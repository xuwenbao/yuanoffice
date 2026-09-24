import { createIpcTransport, type AgentTransport } from '@genoffice/agent-core'
import type { AiSettings } from '@genoffice/ai-provider'
import { t } from '../i18n/locale'
import { pdfPlatform } from '../platform'

/** The shared IPC transport wired to the pdf preload bridge (pdfPlatform().api). */
export function createElectronTransport(getSettings: () => AiSettings): AgentTransport {
  return createIpcTransport<AiSettings>({
    onStream: (listener) => pdfPlatform().api.onAiStream(listener),
    start: (request) => pdfPlatform().api.aiStream(request),
    cancel: (requestId) => void pdfPlatform().api.aiStreamCancel(requestId),
    getSettings,
    unknownErrorText: () => t('aiUnknownError'),
    timeoutErrorText: () => t('aiTimeoutError'),
    creditsErrorText: () => t('aiCreditsExhausted'),
    networkErrorText: () => t('aiNetworkError'),
    overloadedErrorText: () => t('aiOverloadedError'),
  })
}
