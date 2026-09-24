import { createElectronPdfPlatform } from './platform-electron'
import { setPdfPlatform } from './platform'

export async function installPdfHost(): Promise<void> {
  setPdfPlatform(createElectronPdfPlatform())
}
