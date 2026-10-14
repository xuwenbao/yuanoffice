/**
 * Callback subscriptions that wake an external agent when an agent request is created.
 * Design: docs/agent-extension.md
 */
import type { EditorFamily } from './names.js'
import type { AgentRequestKind } from './requests.js'
import { LiveError } from './registry.js'

export interface AgentSubscriptionFilter {
  families?: EditorFamily[]
  paths?: string[]
  kinds?: AgentRequestKind[]
}

export type AgentSink =
  { type: 'webhook'; url: string; secret: string } | { type: 'command'; argv: string[] }

export interface AgentSubscription {
  id: string
  label: string
  sink: AgentSink
  filter?: AgentSubscriptionFilter
  expiresAt: number | null
}

export interface SubscribeInput {
  id: string
  label: string
  sink: AgentSink
  filter?: AgentSubscriptionFilter
  ttlSec?: number
  now?: number
  /** When false, a webhook whose host is not loopback is rejected. */
  allowRemoteCallback?: boolean
}

/** Remote callback URLs stay off unless the control service was started with the switch. */
export function assertCallbackUrl(url: string, allowRemote: boolean): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new LiveError('invalid_argument', `webhook url is not a URL: ${url}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new LiveError('invalid_argument', 'webhook url must be http or https')
  }
  const host = parsed.hostname
  const local = host === '127.0.0.1' || host === 'localhost' || host === '::1'
  if (!local && !allowRemote) {
    throw new LiveError('invalid_argument', 'remote agent callbacks need --allow-remote-callback')
  }
}

export class AgentSubscriptions {
  private readonly items = new Map<string, AgentSubscription>()

  subscribe(input: SubscribeInput): AgentSubscription {
    if (input.sink.type === 'webhook') {
      assertCallbackUrl(input.sink.url, input.allowRemoteCallback === true)
    }
    if (input.sink.type === 'command' && input.sink.argv.length === 0) {
      throw new LiveError('invalid_argument', 'command sink needs an argv')
    }
    const now = input.now ?? Date.now()
    const subscription: AgentSubscription = {
      id: input.id,
      label: input.label,
      sink: input.sink,
      ...(input.filter ? { filter: input.filter } : {}),
      expiresAt:
        typeof input.ttlSec === 'number' && input.ttlSec > 0 ? now + input.ttlSec * 1000 : null,
    }
    this.items.set(subscription.id, subscription)
    return subscription
  }

  unsubscribe(id: string): boolean {
    return this.items.delete(id)
  }

  expire(now = Date.now()): void {
    for (const [id, subscription] of this.items) {
      if (subscription.expiresAt !== null && subscription.expiresAt <= now) this.items.delete(id)
    }
  }

  list(now = Date.now()): AgentSubscription[] {
    this.expire(now)
    return [...this.items.values()]
  }

  matching(
    request: { family: EditorFamily; path: string; kind: AgentRequestKind },
    now = Date.now(),
  ): AgentSubscription[] {
    return this.list(now).filter((subscription) => matches(subscription, request))
  }
}

function matches(
  subscription: AgentSubscription,
  request: { family: EditorFamily; path: string; kind: AgentRequestKind },
): boolean {
  const filter = subscription.filter
  if (!filter) return true
  if (filter.families && !filter.families.includes(request.family)) return false
  if (filter.kinds && !filter.kinds.includes(request.kind)) return false
  if (
    filter.paths &&
    !filter.paths.some((path) => request.path === path || request.path.startsWith(path))
  ) {
    return false
  }
  return true
}
