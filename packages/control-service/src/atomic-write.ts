import { randomBytes } from 'node:crypto'
import { rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

const RETRYABLE = new Set(['EPERM', 'EACCES', 'EBUSY'])

/**
 * Same-directory temp file plus rename. Adapted from
 * apps/docs/src/main/atomic-write.ts so a crash mid-write cannot truncate the
 * document the editor is saving.
 */
export async function atomicWriteFile(filePath: string, data: Uint8Array): Promise<void> {
  const tmp = join(dirname(filePath), `.${basename(filePath)}.${randomBytes(6).toString('hex')}.tmp`)
  try {
    await writeFile(tmp, data)
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, filePath)
        return
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? ''
        if (!RETRYABLE.has(code) || attempt >= 4) throw err
        await new Promise((r) => setTimeout(r, 50 * 2 ** attempt))
      }
    }
  } catch (err) {
    try {
      await unlink(tmp)
    } catch {
      /* temp file was never created */
    }
    throw err
  }
}
