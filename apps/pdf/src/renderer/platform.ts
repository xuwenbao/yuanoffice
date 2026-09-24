import { createPlatformSlot, type AgentControlPort } from '@genoffice/platform'
import type { PdfApi } from '../shared/ipc'
import { createElectronPdfPlatform } from 'pdf-electron-platform'

export interface PdfPlatform {
  api: PdfApi
  ai: { enabled: true } | null
  agentControl: AgentControlPort | null
}

const slot = createPlatformSlot<PdfPlatform>('pdf')
let explicit = false

export function setPdfPlatform(platform: PdfPlatform): void {
  explicit = true
  slot.set(platform)
}

export function pdfPlatform(): PdfPlatform {
  if (explicit) return slot.get()
  return createElectronPdfPlatform()
}
