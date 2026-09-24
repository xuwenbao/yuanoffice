import { createPlatformSlot, type AgentControlPort } from '@genoffice/platform'
import type { SlidesApi } from '../shared/ipc'
import { createElectronSlidesPlatform } from './platform-electron'

export interface SlidesPlatform {
  api: SlidesApi
  ai: { enabled: true } | null
  agentControl: AgentControlPort | null
}

const slot = createPlatformSlot<SlidesPlatform>('slides')
let explicit = false

export function setSlidesPlatform(platform: SlidesPlatform): void {
  explicit = true
  slot.set(platform)
}

export function slidesPlatform(): SlidesPlatform {
  if (explicit) return slot.get()
  return createElectronSlidesPlatform()
}
