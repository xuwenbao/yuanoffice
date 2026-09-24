/**
 * Enough of Buffer for pptx-engine byte writes. Installed before the engine
 * module loads. Node keeps its own Buffer; this file is imported by the web host.
 */
function utf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function withText(bytes: Uint8Array): Uint8Array {
  const wrapped = bytes as Uint8Array & { toString(encoding?: string): string }
  wrapped.toString = (encoding?: string) => {
    if (encoding === 'base64') {
      let binary = ''
      const step = 0x8000
      for (let index = 0; index < wrapped.length; index += step) {
        binary += String.fromCharCode(...wrapped.subarray(index, index + step))
      }
      return btoa(binary)
    }
    return utf8(wrapped)
  }
  return wrapped
}

const polyfill = {
  // JSZip takes a Node-buffer path when this is true. Keep Uint8Array on the browser path.
  isBuffer(_value: unknown): boolean {
    return false
  },
  from(input: string | Uint8Array | ArrayBuffer, encoding?: string): Uint8Array {
    if (typeof input === 'string') {
      if (encoding === 'base64') {
        const binary = atob(input)
        const out = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index)
        return withText(out)
      }
      return withText(new TextEncoder().encode(input))
    }
    if (input instanceof Uint8Array) return withText(new Uint8Array(input))
    return withText(new Uint8Array(input))
  },
}

;(globalThis as unknown as { Buffer: typeof polyfill }).Buffer = polyfill

export {}
