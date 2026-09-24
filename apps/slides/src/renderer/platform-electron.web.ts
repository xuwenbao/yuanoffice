import type { SlidesPlatform } from './platform'

/** Web build stand-in. The real adapter reads window.slidesApi and is not shipped here. */
export function createElectronSlidesPlatform(): SlidesPlatform {
  throw new Error('the desktop platform is not part of the web build')
}
