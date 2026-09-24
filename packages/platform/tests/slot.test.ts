import { describe, expect, it } from 'vitest'
import { createPlatformSlot } from '../src/index'

describe('createPlatformSlot', () => {
  it('throws until an implementation is installed, then returns it', () => {
    const slot = createPlatformSlot<{ n: number }>('docs')
    expect(() => slot.get()).toThrow(/docs/)
    slot.set({ n: 1 })
    expect(slot.get()).toEqual({ n: 1 })
    slot.reset()
    expect(() => slot.get()).toThrow(/docs/)
  })
})
