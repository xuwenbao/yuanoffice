import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LIVE_TOOL_NAMES } from '../src/names'
import { LIVE_ERROR_REASONS } from '../src/requests'

const doc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../docs/agent-extension.md'),
  'utf8',
)

describe('agent extension doc', () => {
  it('names every live tool and every stable error', () => {
    for (const name of LIVE_TOOL_NAMES) {
      expect(doc, name).toContain(name)
    }
    for (const reason of LIVE_ERROR_REASONS) {
      expect(doc, reason).toContain(reason)
    }
  })
})
