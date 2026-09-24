import { describe, expect, it } from 'vitest'
import { displayName, readPreloadGlobal } from '../src/index'

describe('platform-electron helpers', () => {
  it('reads a preload global and ignores a missing one', () => {
    ;(globalThis as { desktop?: { ok: boolean } }).desktop = { ok: true }
    expect(readPreloadGlobal<{ ok: boolean }>('desktop')).toEqual({ ok: true })
    expect(readPreloadGlobal('missing')).toBeNull()
    delete (globalThis as { desktop?: unknown }).desktop
  })

  it('takes the display name from the last path segment', () => {
    expect(displayName('/tmp/report.docx')).toBe('report.docx')
    expect(displayName('C:\\docs\\a.docx')).toBe('a.docx')
  })
})
