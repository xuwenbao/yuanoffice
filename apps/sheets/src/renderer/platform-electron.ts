import type { DesktopApi } from '../shared/desktop-api'
import type { SheetsPlatform } from './platform'

/** Desktop adapter. This module is the one that reads window.desktopApi. */
export function createElectronSheetsPlatform(): SheetsPlatform {
  const api: DesktopApi = window.desktopApi
  return { api, ai: { enabled: true }, agentControl: null }
}
