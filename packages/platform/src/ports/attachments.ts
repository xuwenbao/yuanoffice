/** Host-issued handle. On the desktop this wraps a path; the renderer does not parse it. */
export type AttachmentRef = string

export interface AttachmentMeta {
  ref: AttachmentRef
  name: string
  ext: string
  sizeBytes: number
  /** Display-only location. Absent when the host has no path to show. */
  location?: string
}

export interface AttachmentAddResult {
  accepted: AttachmentMeta[]
  rejected: string[]
}

export interface AttachmentReadResult {
  ok: boolean
  error?: string
  name?: string
  totalChars?: number
  text?: string
  offset?: number
}

export interface AttachmentsPort {
  refForFile(file: File): Promise<AttachmentRef | null>
  add(refs: AttachmentRef[]): Promise<AttachmentAddResult>
  read(ref: AttachmentRef, offset: number, maxChars: number): Promise<AttachmentReadResult>
}
