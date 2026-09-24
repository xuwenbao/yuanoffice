import type { SlidesApi } from '../shared/ipc'
import type { SlidesPlatform } from './platform'

/** Desktop adapter. This module is the one that reads window.slidesApi. */
export function createElectronSlidesPlatform(): SlidesPlatform {
  const api: SlidesApi = window.slidesApi
  return { api, ai: { enabled: true }, agentControl: null }
}
