import { createElectronDocsPlatform } from './platform-electron'
import { setDocsPlatform } from './platform'

/** Electron entry. The only startup path that installs the desktop platform. */
export async function installDocsHost(): Promise<void> {
  setDocsPlatform(createElectronDocsPlatform())
}
