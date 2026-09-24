import { createPlatformSlot, type AgentControlPort } from '@genoffice/platform'
import type { DesktopApi } from '../shared/desktop-api'
import { createElectronSheetsPlatform } from './platform-electron'

export interface SheetsPlatform {
  api: DesktopApi
  ai: { enabled: true } | null
  agentControl: AgentControlPort | null
}

const slot = createPlatformSlot<SheetsPlatform>('sheets')
let explicit = false

export function setSheetsPlatform(platform: SheetsPlatform): void {
  explicit = true
  slot.set(platform)
}

/** Tests that stub window.desktopApi and never call setSheetsPlatform re-read it. */
export function sheetsPlatform(): SheetsPlatform {
  if (explicit) return slot.get()
  return createElectronSheetsPlatform()
}
