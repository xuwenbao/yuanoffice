import { resolve } from 'node:path'
import { delimiter } from 'node:path'
import { flagString } from '../args'
import { startControlService } from '@genoffice/control-service'
import { genofficeUserDataDir } from '../gui'
import type { CommandDef } from '../registry'
import { CliError, EXIT } from '../result'

/** Loopback control service: files, the editor WebSocket, and live MCP. No model calls. */
export const serveCommand: CommandDef = {
  name: 'serve',
  summary:
    'Serve the browser editors and the live MCP/CLI bridge on loopback. Does not call a model.',
  usage:
    'serve --root <dir> [--port <n>] [--static <dir>] [--agent-webhook <url>] [--agent-command <argv>] [--allow-remote-callback]',
  options: [
    {
      name: 'root',
      value: 'dir',
      description: 'directory the file API may read and write; path-delimiter separates several',
    },
    { name: 'port', value: 'n', description: 'loopback port (default 8787)' },
    { name: 'static', value: 'dir', description: 'directory of the built web shell (dist/web)' },
    {
      name: 'agent-webhook',
      value: 'url',
      description: 'loopback URL notified when an editor creates an agent request',
    },
    {
      name: 'agent-command',
      value: 'argv',
      description:
        'command spawned for each agent request; a JSON string array, or whitespace-separated argv',
    },
    {
      name: 'allow-remote-callback',
      description: 'allow agent webhook hosts other than loopback',
    },
  ],
  quiet: true,
  async run(args, ctx) {
    const rootFlag = flagString(args, 'root') ?? ''
    const fromEnv = (ctx.env.GENOFFICE_ALLOWED_ROOTS ?? '').split(delimiter).filter(Boolean)
    const list = [...rootFlag.split(delimiter).filter(Boolean), ...fromEnv]
    if (list.length === 0) {
      throw new CliError(EXIT.usage, 'serve needs at least one --root <dir>', undefined, {
        reason: 'missing_argument',
        suggestion: 'pass --root for every directory the browser may open',
      })
    }
    const portFlag = flagString(args, 'port')
    const port = portFlag ? Number(portFlag) : 8787
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new CliError(EXIT.usage, 'serve --port must be an integer', undefined, {
        reason: 'invalid_argument',
      })
    }
    const userData = ctx.env.GENOFFICE_USER_DATA || genofficeUserDataDir(ctx.env)
    let service
    try {
      service = await startControlService({
        port,
        roots: list.map((root) => resolve(ctx.cwd, root)),
        userData,
        ...(flagString(args, 'static') ? { staticDir: flagString(args, 'static') } : {}),
        ...(flagString(args, 'agent-webhook')
          ? { agentWebhook: flagString(args, 'agent-webhook') }
          : {}),
        ...(flagString(args, 'agent-command')
          ? { agentCommand: flagString(args, 'agent-command') }
          : {}),
        ...(args.flags['allow-remote-callback'] !== undefined ? { allowRemoteCallback: true } : {}),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/webhook|agent command|remote agent/.test(message)) {
        throw new CliError(EXIT.usage, message, undefined, { reason: 'invalid_argument' })
      }
      throw error
    }
    ctx.log(`genoffice serve ${service.url}`)
    if (service.agentWebhookSecret) ctx.log(`agent webhook secret ${service.agentWebhookSecret}`)
    await new Promise(() => {})
    return { summary: service.url }
  },
}
