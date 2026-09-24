import type { DocsPlatform } from './platform'

/** Web build stand-in. The real adapter reads window.desktop and is not shipped here. */
export function createElectronDocsPlatform(): DocsPlatform {
  throw new Error('the desktop platform is not part of the web build')
}
