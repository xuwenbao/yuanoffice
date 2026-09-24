import { describe, expect, it } from 'vitest'
import { TabRouteError, editorKind, resolveTab, type WebTab } from '../src/web/tabs'

const tabs: WebTab[] = [
  { id: 'tab-a', editorId: 'ed-a', path: '/work/a/notes.docx', title: 'notes.docx' },
  { id: 'tab-b', editorId: 'ed-b', path: '/work/b/notes.docx', title: 'notes.docx' },
]

describe('web tab routing', () => {
  it('prefers editor id over a shared file name', () => {
    expect(resolveTab(tabs, 'ed-b').id).toBe('tab-b')
  })

  it('matches one canonical path', () => {
    expect(resolveTab(tabs, '/work/a/notes.docx').editorId).toBe('ed-a')
  })

  it('lists candidates when two tabs share a target', () => {
    const same = [
      ...tabs,
      { id: 'tab-c', editorId: 'ed-c', path: '/work/a/notes.docx', title: 'copy' },
    ]
    expect(() => resolveTab(same, '/work/a/notes.docx')).toThrow(TabRouteError)
    try {
      resolveTab(same, '/work/a/notes.docx')
    } catch (error) {
      expect((error as TabRouteError).candidates).toEqual(['tab-a', 'tab-c'])
    }
  })

  it('maps extensions to editor frames', () => {
    expect(editorKind('a.DOCX')).toBe('docs')
    expect(editorKind('a.pdf')).toBe('pdf')
    expect(editorKind('a.pptx')).toBe('slides')
    expect(editorKind('a.xlsx')).toBe('sheets')
    expect(editorKind('a.txt')).toBeNull()
  })
})
