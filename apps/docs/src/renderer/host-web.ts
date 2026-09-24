import { setDocsPlatform } from './platform'
import { createWebDocsPlatform } from './platform-web'

export async function installDocsHost(): Promise<void> {
  setDocsPlatform(await createWebDocsPlatform())
}
