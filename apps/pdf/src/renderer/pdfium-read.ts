import type { Pdfium } from '../main/text-edit'

let pdfiumPromise: Promise<Pdfium> | null = null

async function loadBrowserPdfium(): Promise<Pdfium> {
  pdfiumPromise ??= (async () => {
    const { init } = (await import('@embedpdf/pdfium')) as unknown as {
      init(overrides: object): Promise<{ pdfium: Pdfium } | Pdfium>
    }
    const wasmUrl = new URL('@embedpdf/pdfium/pdfium.wasm', import.meta.url)
    const wasmBinary = await fetch(wasmUrl).then((response) => response.arrayBuffer())
    const wrapped = await init({ wasmBinary, thisProgram: 'genoffice-pdf' })
    const pdfium = ('pdfium' in wrapped ? wrapped.pdfium : wrapped) as Pdfium
    pdfium._PDFiumExt_Init()
    return pdfium
  })()
  return pdfiumPromise
}

function utf16(bytes: Uint8Array): string {
  return new TextDecoder('utf-16le')
    .decode(bytes)
    .replace(/\0+$/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

/**
 * Read PDF text with pdfium wasm. The desktop main process uses the same
 * library; this copy does not touch the file.
 */
export async function readPdfiumText(
  bytes: Uint8Array,
): Promise<{ pageCount: number; text: string }> {
  const pdfium = await loadBrowserPdfium()
  const size = bytes.byteLength
  const ptr = pdfium._malloc(size)
  if (!ptr) throw new Error('pdfium malloc failed')
  try {
    pdfium.HEAPU8.set(bytes, ptr)
    const doc = pdfium._FPDF_LoadMemDocument(ptr, size, 0)
    if (!doc) throw new Error('pdfium could not open the document')
    try {
      const pageCount = pdfium._FPDF_GetPageCount(doc)
      const parts: string[] = []
      for (let index = 0; index < pageCount; index += 1) {
        const page = pdfium._FPDF_LoadPage(doc, index)
        if (!page) continue
        try {
          const textPage = pdfium._FPDFText_LoadPage(page)
          if (!textPage) continue
          try {
            const chars = pdfium._FPDFText_CountChars(textPage)
            if (chars <= 0) continue
            const buf = pdfium._malloc((chars + 1) * 2)
            if (!buf) continue
            try {
              const written = pdfium._FPDFText_GetText(textPage, 0, chars, buf)
              if (written > 0) parts.push(utf16(pdfium.HEAPU8.subarray(buf, buf + written * 2)))
            } finally {
              pdfium._free(buf)
            }
          } finally {
            pdfium._FPDFText_ClosePage(textPage)
          }
        } finally {
          pdfium._FPDF_ClosePage(page)
        }
      }
      return { pageCount, text: parts.join('\n\n') }
    } finally {
      pdfium._FPDF_CloseDocument(doc)
    }
  } finally {
    pdfium._free(ptr)
  }
}
