import { spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import type { AgentCallbackBody, AgentSubscription } from '@genoffice/editor-control'

/** Expand `{requestId}` and `{mcpUrl}`, then POST or spawn. Failures retry the webhook and never throw. */
export function deliverAgentEvent(
  subscription: AgentSubscription,
  body: AgentCallbackBody,
  env: { mcpUrl: string },
): void {
  if (subscription.sink.type === 'webhook') {
    void postWebhook(subscription.sink.url, subscription.sink.secret, body)
    return
  }
  const argv = subscription.sink.argv.map((part) =>
    part.replaceAll('{requestId}', body.requestId).replaceAll('{mcpUrl}', env.mcpUrl),
  )
  if (!argv[0]) return
  const child = spawn(argv[0], argv.slice(1), {
    env: {
      ...process.env,
      GENOFFICE_MCP_URL: env.mcpUrl,
      GENOFFICE_REQUEST_ID: body.requestId,
    },
    shell: false,
    stdio: 'ignore',
  })
  child.on('error', () => {})
  child.unref()
}

export function parseCommandArgv(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('agent command is empty')
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown
    if (
      !Array.isArray(parsed) ||
      parsed.some((part) => typeof part !== 'string') ||
      parsed.length === 0
    ) {
      throw new Error('agent command JSON must be a non-empty string array')
    }
    return parsed
  }
  return trimmed.split(/\s+/).filter(Boolean)
}

async function postWebhook(url: string, secret: string, body: AgentCallbackBody): Promise<void> {
  const raw = JSON.stringify(body)
  const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
  const delays = [0, 200, 800]
  for (const delay of delays) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-GenOffice-Signature': signature,
        },
        body: raw,
      })
      if (response.ok) return
    } catch {
      /* the next delay retries; delivery is at-least-once */
    }
  }
}
