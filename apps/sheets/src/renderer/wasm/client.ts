/**
 * Browser client for the wasm32-wasip1 xlsx reactor.
 * The desktop sidecar stays a native process. This module only speaks the
 * open / read_range / close subset in protocol.rs.
 */
export interface XlsxReactor {
  dispatch(line: string): string
}

export async function loadXlsxReactor(
  wasmUrl: string,
  wasiImport: WebAssembly.Imports,
): Promise<XlsxReactor> {
  const bytes = await fetch(wasmUrl).then((response) => response.arrayBuffer())
  const { instance } = await WebAssembly.instantiate(bytes, wasiImport)
  const exports = instance.exports as {
    xlsx_alloc?: (size: number) => number
    xlsx_dispatch?: (ptr: number) => number
    xlsx_free?: (ptr: number) => void
    memory?: WebAssembly.Memory
    _initialize?: () => void
  }
  exports._initialize?.()
  const memory = exports.memory
  const alloc = exports.xlsx_alloc
  const dispatch = exports.xlsx_dispatch
  const free = exports.xlsx_free
  if (!memory || !alloc || !dispatch || !free)
    throw new Error('xlsx wasm is missing the reactor exports')
  return {
    dispatch(line: string) {
      const encoded = new TextEncoder().encode(`${line}\0`)
      const ptr = alloc(encoded.byteLength)
      new Uint8Array(memory.buffer).set(encoded, ptr)
      const out = dispatch(ptr)
      const text = readCString(memory, out)
      free(out)
      return text
    },
  }
}

function readCString(memory: WebAssembly.Memory, ptr: number): string {
  const bytes = new Uint8Array(memory.buffer)
  let end = ptr
  while (bytes[end] !== 0) end += 1
  return new TextDecoder().decode(bytes.subarray(ptr, end))
}
