/** Opaque handle for a document the control service can read and write. */
export interface DocumentRef {
  kind: 'local'
  /** Absolute path. The renderer displays `name`, not this string, in the title. */
  path: string
}

export interface OpenedDocument {
  ref: DocumentRef
  /** Display name supplied by the host, for example `report.docx`. */
  name: string
  data: ArrayBuffer
  /** sha256 hex of `data`. */
  hash: string
}

export interface SaveDocumentResult {
  ok: boolean
  error?: string
  reason?: 'external-modified' | 'needs-permission'
}

export interface SaveNamedDocumentResult {
  ok: boolean
  ref?: DocumentRef
  name?: string
  error?: string
  reason?: 'needs-user-gesture' | 'exists'
}
