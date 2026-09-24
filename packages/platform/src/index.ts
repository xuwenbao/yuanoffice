/**
 * Host capability seam.
 *
 * An app composes the ports it needs. Every member of a port it names is
 * required. A host that lacks a capability sets that key to null; it does not
 * omit the key and it does not stub a success.
 */
import type { AgentControlPort } from './ports/agent-control.js'
import type { AttachmentsPort } from './ports/attachments.js'
import type { LanguagePort } from './ports/language.js'
import type { WindowPort } from './ports/window.js'

export type { AgentCommand, AgentControlPort, LiveEditorState } from './ports/agent-control.js'
export type {
  AttachmentAddResult,
  AttachmentMeta,
  AttachmentReadResult,
  AttachmentRef,
  AttachmentsPort,
} from './ports/attachments.js'
export type { LanguagePort } from './ports/language.js'
export type { TabInfo, WindowPort } from './ports/window.js'
export type {
  DocumentRef,
  OpenedDocument,
  SaveDocumentResult,
  SaveNamedDocumentResult,
} from './document.js'

export interface PlatformPorts {
  language: LanguagePort
  attachments: AttachmentsPort
  window: WindowPort
  agentControl: AgentControlPort
}

export type PortName = keyof PlatformPorts

/** A host providing exactly the named capabilities. All of them are required. */
export type Platform<K extends PortName = PortName> = Pick<PlatformPorts, K>

export interface PlatformSlot<P> {
  set(platform: P): void
  get(): P
  /** Test hook. Production hosts set the slot once at startup. */
  reset(): void
}

export function createPlatformSlot<P>(label: string): PlatformSlot<P> {
  let current: P | undefined
  return {
    set(platform: P): void {
      current = platform
    },
    get(): P {
      if (current === undefined) {
        throw new Error(
          `No platform implementation installed for "${label}". ` +
            `Call set() from the ${label} renderer entry before rendering.`,
        )
      }
      return current
    },
    reset(): void {
      current = undefined
    },
  }
}
