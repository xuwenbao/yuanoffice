/**
 * AI panel used when the docs host talks to an external agent instead of AgentLoop.
 * Design: docs/agent-extension.md
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { useI18n } from '../i18n/locale'
import type { DocsEditQueueItem } from './edit-queue'
import { liveItems, resolveQueue } from './edit-queue'
import { EditQueueCard } from './EditQueueCard'
import { createExternalBackend, type DocsAgentTarget } from './backend'
import { hasSnapshot, restoreSnapshot, setExternalTrack } from './agent-runs'
import { setAnchorWorking } from '../editor/ai-queue-anchors'
import type { ExternalAgentPort } from '../platform'

interface Bubble {
  id: string
  role: 'user' | 'agent'
  text: string
  requestId?: string
}

interface Props {
  editor: Editor
  port: ExternalAgentPort
  editQueue: DocsEditQueueItem[]
  onQueueEditInstruction: (qid: string, text: string) => void
  onQueueRemove: (qid: string) => void
  onQueueClear: () => void
  onQueueFocus: (qid: string) => void
  onQueueConsume: (qids: string[]) => void
}

export function ExternalAgentPanel({
  editor,
  port,
  editQueue,
  onQueueEditInstruction,
  onQueueRemove,
  onQueueClear,
  onQueueFocus,
  onQueueConsume,
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const backend = useMemo(() => createExternalBackend(port), [port])
  const [input, setInput] = useState('')
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [track, setTrack] = useState(false)
  const anchorsRef = useRef<Record<string, string[]>>({})
  const consumeRef = useRef(onQueueConsume)
  consumeRef.current = onQueueConsume
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    return backend.onEvent((event) => {
      if (event.event === 'claimed') setBusyId(event.requestId)
      if (event.event === 'message' && event.text) {
        setBubbles((list) => [
          ...list,
          { id: `${event.requestId}-m-${list.length}`, role: 'agent', text: event.text! },
        ])
      }
      if (event.event === 'rejected' || event.event === 'failed' || event.event === 'cancelled') {
        setBusyId((current) => (current === event.requestId ? null : current))
        const qids = anchorsRef.current[event.requestId] ?? []
        for (const qid of qids) setAnchorWorking(editor, qid, false)
        setBubbles((list) => [
          ...list,
          {
            id: `${event.requestId}-end`,
            role: 'agent',
            text: event.error || event.summary || tRef.current('aiAgentFailed'),
          },
        ])
      }
      if (event.event === 'done') {
        setBusyId((current) => (current === event.requestId ? null : current))
        const qids = anchorsRef.current[event.requestId] ?? []
        for (const qid of qids) setAnchorWorking(editor, qid, false)
        if (qids.length > 0) consumeRef.current(qids)
        setBubbles((list) => [
          ...list,
          {
            id: `${event.requestId}-done`,
            role: 'agent',
            text: event.summary || tRef.current('aiAgentDone'),
            requestId: hasSnapshot(event.requestId) ? event.requestId : undefined,
          },
        ])
      }
    })
  }, [backend, editor])

  const send = (kind: 'chat' | 'queue_batch', instruction: string, targets: DocsAgentTarget[]) => {
    const requestId = backend.submit({ kind, instruction, targets })
    setBusyId(requestId)
    anchorsRef.current = {
      ...anchorsRef.current,
      [requestId]: targets.map((target) => target.anchorId),
    }
    for (const target of targets) setAnchorWorking(editor, target.anchorId, true)
    setBubbles((list) => [...list, { id: requestId, role: 'user', text: instruction }])
  }

  const sendQueue = () => {
    const entries = liveItems(resolveQueue(editor, editQueue))
    if (entries.length === 0) {
      onQueueClear()
      return
    }
    const targets: DocsAgentTarget[] = entries.map((entry) => ({
      family: 'docs',
      anchorId: entry.item.qid,
      blocks: [entry.target.startIndex, entry.target.endIndex],
      text: entry.target.excerpt,
    }))
    const instruction = entries
      .map(
        (entry, index) =>
          `${index + 1}. anchor ${entry.item.qid}, blocks ${entry.target.startIndex}-${entry.target.endIndex}: ${entry.item.instruction}`,
      )
      .join('\n')
    send('queue_batch', instruction, targets)
  }

  return (
    <div className="ai-panel">
      <div className="ai-panel-head">
        <span>{t('aiExternalPanelTitle')}</span>
        <button
          type="button"
          className={`ai-track-btn${track ? ' on' : ''}`}
          onClick={() => {
            const next = !track
            setTrack(next)
            setExternalTrack(next)
          }}
        >
          {t('aiTrackChanges')}
        </button>
      </div>
      <div className="ai-thread">
        {bubbles.length === 0 && <div className="ai-queue-hint">{t('aiExternalHint')}</div>}
        {bubbles.map((bubble) => (
          <div key={bubble.id} className={bubble.role === 'user' ? 'ai-user' : 'ai-assistant'}>
            <div>{bubble.text}</div>
            {bubble.requestId && (
              <button type="button" onClick={() => restoreSnapshot(editor, bubble.requestId!)}>
                {t('aiRollbackRun')}
              </button>
            )}
          </div>
        ))}
        {busyId && <div className="ai-queue-hint">{t('aiAgentWorking')}</div>}
      </div>
      <div className="ai-composer">
        <EditQueueCard
          items={editQueue}
          editor={editor}
          busy={busyId !== null}
          onEditInstruction={onQueueEditInstruction}
          onRemove={onQueueRemove}
          onDiscardAll={onQueueClear}
          onSend={sendQueue}
          onFocus={onQueueFocus}
        />
        <textarea
          value={input}
          placeholder={t('aiAskPlaceholder')}
          onChange={(event) => setInput(event.target.value)}
        />
        <button
          type="button"
          disabled={!input.trim() || busyId !== null}
          onClick={() => {
            const text = input.trim()
            setInput('')
            send('chat', text, [])
          }}
        >
          {t('aiAskSendNow')}
        </button>
        {busyId && (
          <button type="button" onClick={() => backend.cancel(busyId)}>
            {t('aiStop')}
          </button>
        )}
      </div>
    </div>
  )
}
