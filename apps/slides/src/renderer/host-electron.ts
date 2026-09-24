import { createElectronSlidesPlatform } from './platform-electron'
import { setSlidesPlatform } from './platform'

export async function installSlidesHost(): Promise<void> {
  setSlidesPlatform(createElectronSlidesPlatform())
}
