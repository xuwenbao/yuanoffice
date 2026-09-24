import type { SheetsPlatform } from './platform'

/** Web build stand-in. The real adapter reads window.desktopApi and is not shipped here. */
export function createElectronSheetsPlatform(): SheetsPlatform {
  throw new Error('the desktop platform is not part of the web build')
}
