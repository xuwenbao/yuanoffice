import {
  commitSaved,
  findGroupChild,
  openPptx,
  parseTheme,
  savePptx,
  type OpenedPptx,
  type Slide,
} from '@genoffice/pptx-engine'
import { resolveGroupChildId, runTxn, type TxnRequest } from '@genoffice/pptx-ops'
import {
  buildRenderSlide,
  EMU_PER_PX_96,
  type FontMetricsProvider,
  type RenderSlide,
} from '@genoffice/pptx-render'
import type { EditTextOp, EditTransformOp } from '../shared/ipc'
import type { Session } from './session'

/** Open a deck from bytes. Desktop and the browser host both start here. */
export function openDeck(bytes: Uint8Array): Promise<OpenedPptx> {
  return openPptx(bytes)
}

/** Theme body font shown when the selection has no text element. */
export function deckDefaultFont(opened: OpenedPptx): string | undefined {
  try {
    const slidePath = opened.archive.readPresentation().slidePaths[0]
    if (!slidePath) return undefined
    const themePath = opened.archive.resolveSlideChain(slidePath).themePath
    const xml = themePath ? opened.archive.readText(themePath) : undefined
    return xml ? parseTheme(xml).minorFont : undefined
  } catch {
    return undefined
  }
}

export function deckDirty(session: Session): boolean {
  return (
    !!session.metaDirty ||
    session.opened.deck.slides.some(
      (slide) => slide.structureDirty || slide.elements.some((el) => el.dirty || el.dirtyTransform),
    )
  )
}

/** One render tree for every slide. The caller supplies media and font metrics. */
export function renderSlides(
  opened: OpenedPptx,
  fitWidthPx: number,
  mediaForSlide: (slidePath: string | undefined) => (mediaRef: string) => string | undefined,
  metrics?: FontMetricsProvider,
): RenderSlide[] {
  return opened.deck.slides.map((slide, index) =>
    renderSlide(opened, slide, fitWidthPx, mediaForSlide(slide.path), metrics, index + 1),
  )
}

export function renderSlide(
  opened: OpenedPptx,
  slide: Slide,
  fitWidthPx: number,
  media: (mediaRef: string) => string | undefined,
  metrics: FontMetricsProvider | undefined,
  slideNo: number,
): RenderSlide {
  return buildRenderSlide(slide, opened.deck.size, {
    fitWidthPx,
    media,
    ...(metrics ? { metrics } : {}),
    slideNo,
  })
}

/** Browser media: data URLs from archive bytes. Desktop keeps the TIFF/SVG resolver. */
export function dataUrlMedia(
  opened: OpenedPptx,
): (slidePath: string | undefined) => (mediaRef: string) => string | undefined {
  const caches = new Map<string, Map<string, string | undefined>>()
  return (slidePath) => {
    const key = slidePath ?? ''
    let cache = caches.get(key)
    if (!cache) {
      cache = new Map()
      caches.set(key, cache)
    }
    return (mediaRef) => {
      if (cache.has(mediaRef)) return cache.get(mediaRef)
      const bytes = opened.archive.readBytes(mediaRef)
      const url = bytes ? `data:${mimeFor(mediaRef, bytes)};base64,${toBase64(bytes)}` : undefined
      cache.set(mediaRef, url)
      return url
    }
  }
}

/** Canonical setText transaction. Autofit stays with the caller. */
export function textEditRequest(op: EditTextOp): TxnRequest {
  return {
    ops: [
      {
        op: 'setText',
        target: { slide: op.slideIndex, el: op.sourceId },
        paragraphs: op.paragraphs,
        ...(op.groupId ? { group: op.groupId } : {}),
      },
    ],
  }
}

/** Canonical setTransform transaction, in EMU. Preview undo stays with the caller. */
export function transformRequest(opened: OpenedPptx, op: EditTransformOp) {
  const slide = opened.deck.slides[op.slideIndex]
  if (!slide) return null
  const childId = op.groupId ? resolveGroupChildId(slide, op.groupId, op.sourceId) : op.sourceId
  const grouped = op.groupId ? findGroupChild(slide, op.groupId, childId) : null
  if (op.groupId && !grouped) return null
  const baseWidthPx = opened.deck.size.cx / EMU_PER_PX_96
  const scale = op.fitWidthPx / baseWidthPx
  const toEmu = (px: number) => Math.round((px / scale) * EMU_PER_PX_96)
  let box: { x: number; y: number; cx: number; cy: number }
  if (grouped) {
    const child = grouped.grp.childOffset
    const childX = child?.x ?? grouped.grp.transform.offset.x
    const childY = child?.y ?? grouped.grp.transform.offset.y
    const extent = grouped.grp.transform.offset
    const scaleX = child?.cx ? extent.cx / child.cx : 1
    const scaleY = child?.cy ? extent.cy / child.cy : 1
    box = {
      x: toEmu(op.xPx / scaleX) + childX,
      y: toEmu(op.yPx / scaleY) + childY,
      cx: toEmu(op.wPx / scaleX),
      cy: toEmu(op.hPx / scaleY),
    }
  } else {
    box = { x: toEmu(op.xPx), y: toEmu(op.yPx), cx: toEmu(op.wPx), cy: toEmu(op.hPx) }
  }
  return {
    op: 'setTransform' as const,
    target: { slide: op.slideIndex, el: op.sourceId },
    box,
    rotDeg: op.rotationDeg,
    ...(op.groupId ? { group: op.groupId } : { resizeTableGrid: true }),
  }
}

export function applyTxn(opened: OpenedPptx, request: TxnRequest) {
  return runTxn(opened, request)
}

/**
 * Serialize and mark the in-memory deck saved. The desktop host streams the
 * same package to disk with savePptxToFile, then calls commitOpened.
 */
export async function saveOpenedBytes(opened: OpenedPptx): Promise<Uint8Array> {
  const bytes = await savePptx(opened)
  commitSaved(opened)
  return bytes
}

export function commitOpened(opened: OpenedPptx): void {
  commitSaved(opened)
}

function mimeFor(name: string, bytes: Uint8Array): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif'
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49) return 'image/webp'
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'mp4') return 'video/mp4'
  if (ext === 'mp3') return 'audio/mpeg'
  return 'application/octet-stream'
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const step = 0x8000
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step))
  }
  return btoa(binary)
}
