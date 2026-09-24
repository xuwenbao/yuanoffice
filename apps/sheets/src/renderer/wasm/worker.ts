import { ConsoleStdout, File, OpenFile, PreopenDirectory, WASI } from '@bjorn3/browser_wasi_shim'

interface Reactor {
  dispatch(line: string): string
}

let reactor: Reactor | null = null

self.onmessage = (event: MessageEvent) => {
  const message = event.data as {
    type: string
    requestId: number
    wasm?: ArrayBuffer
    book?: Uint8Array
    line?: string
  }
  if (message.type === 'open') {
    void openBook(message.requestId, message.wasm!, message.book!)
    return
  }
  if (message.type === 'dispatch') {
    try {
      if (!reactor) throw new Error('xlsx reactor is not open')
      const text = reactor.dispatch(message.line!)
      self.postMessage({ type: 'reply', requestId: message.requestId, text })
    } catch (error) {
      self.postMessage({
        type: 'error',
        requestId: message.requestId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

async function openBook(requestId: number, wasm: ArrayBuffer, book: Uint8Array): Promise<void> {
  try {
    const wasi = new WASI(
      ['xlsx-sidecar'],
      [],
      [
        new OpenFile(new File(new Uint8Array())),
        ConsoleStdout.lineBuffered((line) => console.log(line)),
        ConsoleStdout.lineBuffered((line) => console.warn(line)),
        new PreopenDirectory('/work', new Map([['book.xlsx', new File(book)]])),
        new PreopenDirectory('/tmp', new Map()),
      ],
    )
    const { instance } = await WebAssembly.instantiate(wasm, {
      wasi_snapshot_preview1: wasi.wasiImport,
    })
    wasi.initialize(instance as Parameters<WASI['initialize']>[0])
    reactor = bindReactor(instance.exports as Record<string, unknown>)
    const text = reactor.dispatch(
      JSON.stringify({ command: { command: 'open', path: '/work/book.xlsx' } }),
    )
    self.postMessage({ type: 'reply', requestId, text })
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function bindReactor(exports: Record<string, unknown>): Reactor {
  const memory = exports.memory as WebAssembly.Memory | undefined
  const alloc = exports.xlsx_alloc as ((size: number) => number) | undefined
  const dispatch = exports.xlsx_dispatch as ((ptr: number) => number) | undefined
  const free = exports.xlsx_free as ((ptr: number) => void) | undefined
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
