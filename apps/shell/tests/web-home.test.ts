import { describe, expect, it } from 'vitest'
import { matchesExt, matchesQuery, nextFileName, remember, toggleStar } from '../src/web/library'

describe('web home library', () => {
  it('picks the next unused untitled name', () => {
    expect(nextFileName([], '未命名', 'docx')).toBe('未命名.docx')
    expect(nextFileName(['未命名.docx', '未命名 2.docx'], '未命名', 'docx')).toBe('未命名 3.docx')
  })

  it('keeps a star when the file is opened again', () => {
    const starred = toggleStar(remember([], '/a.docx', 1), '/a.docx', 1)
    expect(remember(starred, '/a.docx', 5)).toEqual([{ path: '/a.docx', openedAt: 5, starred: true }])
  })

  it('filters by extension family and by name or folder', () => {
    expect(matchesExt('budget.xlsm', 'xlsx')).toBe(true)
    expect(matchesExt('notes.docx', 'pdf')).toBe(false)
    expect(matchesQuery('Plan.docx', 'Reports', 'rep')).toBe(true)
    expect(matchesQuery('Plan.docx', 'Reports', 'slide')).toBe(false)
  })
})