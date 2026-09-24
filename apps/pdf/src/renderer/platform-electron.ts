import type { PdfApi } from '../shared/ipc'
import type { PdfPlatform } from './platform'

/** Desktop adapter. This module is the one that reads window.pdfApi. */
export function createElectronPdfPlatform(): PdfPlatform {
  const api: PdfApi = window.pdfApi
  return { api, ai: { enabled: true }, agentControl: null }
}
