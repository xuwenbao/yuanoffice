import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { asBytes } from '../src/bytes'

describe('pptx bytes helper', () => {
  it('copies an ArrayBuffer and keeps a Uint8Array', () => {
    const source = new Uint8Array([1, 2, 3])
    expect(asBytes(source)).toBe(source)
    const copy = asBytes(source.buffer)
    expect(copy).toEqual(source)
    expect(copy).not.toBe(source)
  })

  it('does not import Node built-ins', () => {
    const source = readFileSync(new URL('../src/bytes.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/node:/)
    expect(source).not.toMatch(/\bBuffer\b/)
  })
})
