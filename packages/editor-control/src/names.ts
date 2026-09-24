/** Commands an open editor knows how to run. Official MCP names, plus document_status. */
export const LIVE_TOOL_NAMES = [
  'open_documents',
  'read_document',
  'insert_content',
  'replace_blocks',
  'apply_ops',
  'apply_sheet_ops',
  'apply_slide_ops',
  'read_pdf',
  'save_document',
  'document_status',
] as const

export type LiveToolName = (typeof LIVE_TOOL_NAMES)[number]

/** What the editor process actually executes. open_documents is routed by the service. */
export const LIVE_COMMANDS = [
  'read_document',
  'insert_content',
  'replace_blocks',
  'apply_ops',
  'apply_sheet_ops',
  'apply_slide_ops',
  'read_pdf',
  'save_document',
  'document_status',
] as const

export type LiveCommandName = (typeof LIVE_COMMANDS)[number]

export type EditorFamily = 'docs' | 'pdf' | 'slides' | 'sheets'
