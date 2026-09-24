import { describe, expect, it } from 'vitest'
import { dispatchLiveTool } from '../src/dispatch'
import { EditorRegistry } from '../src/registry'

function registryWith(
  run: (command: string, payload: unknown) => Promise<unknown>,
): EditorRegistry {
  const registry = new EditorRegistry(1_000)
  registry.register({
    editorId: 'e1',
    path: '/docs/a.docx',
    family: 'docs',
    title: 'a.docx',
    revision: 3,
    dirty: false,
    run: run as never,
  })
  return registry
}

describe('live tool dispatch', () => {
  it('marks an edit as not persisted and rejects a stale revision', async () => {
    const registry = registryWith(async () => ({ summary: 'inserted' }))
    const applied = await dispatchLiveTool(
      registry,
      'insert_content',
      { document: '/docs/a.docx', html: '<p>x</p>' },
      { save: async () => ({ path: '/docs/a.docx' }) },
    )
    expect(applied).toMatchObject({ applied: true, persisted: false, revision: 3 })
    registry.update('e1', { revision: 4, dirty: true })
    await expect(
      dispatchLiveTool(
        registry,
        'apply_ops',
        { document: 'e1', ops: [], baseRevision: 3 },
        { save: async () => ({ path: '/docs/a.docx' }) },
      ),
    ).rejects.toMatchObject({ reason: 'revision_conflict' })
  })

  it('refuses to close a dirty document without an explicit choice', async () => {
    const registry = registryWith(async () => ({}))
    registry.update('e1', { dirty: true })
    await expect(
      dispatchLiveTool(
        registry,
        'open_documents',
        { action: 'close', target: 'e1' },
        {
          save: async () => ({ path: '/docs/a.docx' }),
        },
      ),
    ).rejects.toMatchObject({ reason: 'unsaved_changes' })
  })

  it('returns editor_disconnected after the page drops, and keeps the path', () => {
    const registry = registryWith(async () => ({}))
    registry.markDisconnected('e1', 0)
    expect(registry.paths()).toEqual(['/docs/a.docx'])
    return expect(
      dispatchLiveTool(
        registry,
        'read_document',
        { document: 'e1' },
        {
          save: async () => ({ path: '/docs/a.docx' }),
        },
      ),
    ).rejects.toMatchObject({ reason: 'editor_disconnected' })
  })
})
