import { describe, expect, it } from 'vitest'
import { FRAME_PROTOCOL, parseFrameToShell, parseShellToFrame } from '../src/frame-wire'

const origin = 'http://127.0.0.1:8787'

describe('frame protocol', () => {
  it('rejects a foreign origin and the opaque null origin', () => {
    const data = { protocol: FRAME_PROTOCOL, kind: 'ready', frameId: 't1' }
    expect(parseFrameToShell({ origin: 'http://evil.test', data }, origin)).toBeNull()
    expect(parseFrameToShell({ origin: 'null', data }, origin)).toBeNull()
  })

  it('accepts a doc-state from the same origin', () => {
    expect(
      parseFrameToShell(
        {
          origin,
          data: {
            protocol: FRAME_PROTOCOL,
            kind: 'doc-state',
            frameId: 't1',
            title: 'Report',
            dirty: true,
            path: '/docs/a.docx',
          },
        },
        origin,
      ),
    ).toMatchObject({ kind: 'doc-state', dirty: true, path: '/docs/a.docx' })
  })

  it('accepts a focus request from the shell', () => {
    expect(
      parseShellToFrame(
        { origin, data: { protocol: FRAME_PROTOCOL, kind: 'focus-request', requestId: 'r1' } },
        origin,
      ),
    ).toEqual({ protocol: FRAME_PROTOCOL, kind: 'focus-request', requestId: 'r1' })
  })
})
