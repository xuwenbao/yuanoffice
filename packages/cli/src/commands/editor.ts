import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { flagBool, flagString } from '../args'
import { controlEndpoint, controlRequest } from '../control'
import type { CommandDef } from '../registry'
import { CliError, EXIT } from '../result'

/**
 * Drive the browser editor through the control service.
 * Edits change the page and leave the file alone until `editor save`.
 */
export const editorCommand: CommandDef = {
  name: 'editor',
  summary:
    'Read or edit the document open in the browser editor. apply does not write the file; save does.',
  usage: 'editor list | editor read|apply|status|save --doc <id|path> [--ops <file>] [--path <file>] [--overwrite]',
  options: [
    { name: 'doc', value: 'id|path', description: 'editor id or absolute path of the open document' },
    { name: 'ops', value: 'file', description: 'JSON ops for editor apply' },
    { name: 'path', value: 'file', description: 'editor save: write a copy to this path' },
    { name: 'overwrite', description: 'editor save: replace an existing copy' },
  ],
  async run(args, ctx) {
    const verb = args.positionals[0]
    const endpoint = controlEndpoint(ctx.env, 'web')
    if (!endpoint) {
      throw new CliError(EXIT.app, 'the browser control service is not running', undefined, {
        reason: 'app_unavailable',
        suggestion: 'start it with `genoffice serve --root <dir>`',
      })
    }
    if (verb === 'list') {
      const result = await controlRequest(endpoint, { cmd: 'editor-list' })
      const documents = Array.isArray(result.documents) ? result.documents : []
      return { summary: `${documents.length} open`, detail: result }
    }
    const doc = flagString(args, 'doc')
    if (!doc) {
      throw new CliError(EXIT.usage, 'editor needs --doc <id|path>', undefined, {
        reason: 'missing_argument',
        suggestion: 'pass --doc with an editor id from `editor list` or the file path',
      })
    }
    if (verb === 'read') {
      const result = await controlRequest(endpoint, { cmd: 'editor-read', doc })
      return { summary: 'read from the editor', detail: result }
    }
    if (verb === 'status') {
      const result = await controlRequest(endpoint, { cmd: 'editor-status', doc })
      return { summary: result.dirty ? 'unsaved changes' : 'saved', detail: result }
    }
    if (verb === 'apply') {
      const opsPath = flagString(args, 'ops')
      if (!opsPath) {
        throw new CliError(EXIT.usage, 'editor apply needs --ops <file>', undefined, {
          reason: 'missing_argument',
        })
      }
      const abs = isAbsolute(opsPath) ? opsPath : resolve(ctx.cwd, opsPath)
      const ops = JSON.parse(readFileSync(abs, 'utf8')) as unknown
      const result = await controlRequest(endpoint, { cmd: 'editor-apply', doc, ops })
      return { summary: 'applied in the editor; file not written', detail: result }
    }
    if (verb === 'save') {
      const path = flagString(args, 'path')
      const result = await controlRequest(endpoint, {
        cmd: 'editor-save',
        doc,
        ...(path ? { path: isAbsolute(path) ? path : resolve(ctx.cwd, path) } : {}),
        ...(flagBool(args, 'overwrite') ? { overwrite: true } : {}),
      })
      return { summary: `saved ${String(result.path ?? doc)}`, detail: result }
    }
    throw new CliError(EXIT.usage, `unknown editor command ${verb ?? ''}`, undefined, {
      reason: 'invalid_usage',
      suggestion: 'use list, read, apply, status, or save',
    })
  },
}
