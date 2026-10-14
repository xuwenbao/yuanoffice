import { describe, expect, it } from 'vitest'
import { dispatchLiveTool } from '../src/dispatch'
import { EditorRegistry } from '../src/registry'
import { AgentRequestStore, callbackBody } from '../src/requests'
import { AgentSubscriptions } from '../src/subscriptions'

function registry(): EditorRegistry {
  const reg = new EditorRegistry(1_000)
  reg.register({
    editorId: 'e1',
    path: '/docs/a.docx',
    family: 'docs',
    title: 'a.docx',
    revision: 2,
    dirty: false,
    run: async (command, payload) => ({
      command,
      payload,
      text: 'hello',
      marked: '<sel>hello</sel>',
    }),
  })
  return reg
}

const target = {
  family: 'docs' as const,
  anchorId: 'a1',
  blocks: [0, 0] as [number, number],
  text: 'hello',
}

describe('agent requests', () => {
  it('moves pending to claimed to done, and refuses a second claim', () => {
    const store = new AgentRequestStore()
    const events: string[] = []
    store.on((event) => events.push(event.type))
    store.submit({
      requestId: 'r1',
      editorId: 'e1',
      path: '/docs/a.docx',
      family: 'docs',
      kind: 'edit_selection',
      instruction: 'shorten this',
      targets: [target],
      revisionAtCreate: 2,
    })
    expect(callbackBody({ type: 'created', request: store.get('r1') })?.targetCount).toBe(1)
    expect(callbackBody({ type: 'created', request: store.get('r1') })?.instructionPreview).toBe(
      'shorten this',
    )
    store.claim('r1', 'cursor')
    expect(() => store.claim('r1', 'other')).toThrow(/is claimed/)
    store.message('r1', 'working')
    store.complete('r1', 'done', 'shortened')
    expect(store.get('r1').status).toBe('done')
    expect(store.cancel('r1').status).toBe('done')
    expect(events).toEqual(['created', 'claimed', 'message', 'completed'])
  })

  it('cancels an open request and rejects later edits', () => {
    const store = new AgentRequestStore()
    store.submit({
      requestId: 'r1',
      editorId: 'e1',
      path: '/docs/a.docx',
      family: 'docs',
      kind: 'chat',
      instruction: 'hello',
      targets: [],
      revisionAtCreate: 0,
    })
    store.cancel('r1')
    expect(() => store.claim('r1', 'cursor')).toThrow(/cancelled/)
  })

  it('rejects a remote webhook unless remote callbacks are allowed', () => {
    const subscriptions = new AgentSubscriptions()
    expect(() =>
      subscriptions.subscribe({
        id: 's1',
        label: 'remote',
        sink: { type: 'webhook', url: 'https://example.com/hook', secret: 's' },
      }),
    ).toThrow(/remote agent callbacks/)
    const local = subscriptions.subscribe({
      id: 's2',
      label: 'local',
      sink: { type: 'webhook', url: 'http://127.0.0.1:9/hook', secret: 's' },
    })
    expect(local.id).toBe('s2')
  })

  it('requires a claim before replace_selection and returns fresh context', async () => {
    const requests = new AgentRequestStore()
    const subscriptions = new AgentSubscriptions()
    subscriptions.subscribe({
      id: 's1',
      label: 'local',
      sink: { type: 'webhook', url: 'http://127.0.0.1:9/hook', secret: 's' },
    })
    requests.submit({
      requestId: 'r1',
      editorId: 'e1',
      path: '/docs/a.docx',
      family: 'docs',
      kind: 'edit_selection',
      instruction: 'shorten',
      targets: [target],
      revisionAtCreate: 2,
    })
    const options = { requests, subscriptions, save: async () => ({ path: '/docs/a.docx' }) }
    await expect(
      dispatchLiveTool(
        registry(),
        'replace_selection',
        { document: 'e1', requestId: 'r1', html: 'x' },
        options,
      ),
    ).rejects.toMatchObject({ reason: 'invalid_argument' })
    await dispatchLiveTool(
      registry(),
      'claim_agent_request',
      { requestId: 'r1', agent: 'cursor' },
      options,
    )
    const read = await dispatchLiveTool(
      registry(),
      'get_agent_request',
      { requestId: 'r1' },
      options,
    )
    expect(read.context).toMatchObject({ text: 'hello' })
    let payload: unknown
    const reg = new EditorRegistry()
    reg.register({
      editorId: 'e1',
      path: '/docs/a.docx',
      family: 'docs',
      title: 'a.docx',
      revision: 2,
      dirty: false,
      run: async (_command, body) => {
        payload = body
        return { summary: 'replaced' }
      },
    })
    const applied = await dispatchLiveTool(
      reg,
      'replace_selection',
      { document: 'e1', requestId: 'r1', html: '<b>x</b>', expectedText: 'hello' },
      options,
    )
    expect(applied).toMatchObject({ applied: true, persisted: false })
    expect(payload).toMatchObject({ html: '<b>x</b>', targets: [target] })
  })
})
