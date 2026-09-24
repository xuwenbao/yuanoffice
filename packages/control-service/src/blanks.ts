import { buildBlankDocx } from '@genoffice/docx-engine'
import { createBlankPptx } from '@genoffice/pptx-engine'
import { blankXlsxBuffer } from '@genoffice/xlsx-gateway/gateway/csv-import'
import { PDFDocument } from 'pdf-lib'

export const BLANK_KINDS = ['docx', 'xlsx', 'pptx', 'pdf'] as const
export type BlankKind = (typeof BLANK_KINDS)[number]

/** Kind from a file name. Unknown extensions are not created. */
export function blankKind(name: string): BlankKind | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return (BLANK_KINDS as readonly string[]).includes(ext) ? (ext as BlankKind) : null
}

/** Bytes for a new empty document. Same templates the desktop "new" actions use. */
export async function blankBytes(kind: BlankKind): Promise<Uint8Array> {
  if (kind === 'docx') return buildBlankDocx()
  if (kind === 'xlsx') return new Uint8Array(await blankXlsxBuffer())
  if (kind === 'pptx') return createBlankPptx()
  const doc = await PDFDocument.create()
  doc.addPage([595.28, 841.89])
  return doc.save()
}
