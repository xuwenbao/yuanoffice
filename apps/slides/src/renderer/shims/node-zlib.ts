import { deflate } from 'pako'

/** Browser stand-in for the PNG poster path. Node's deflateSync is zlib-wrapped. */
export function deflateSync(data: Uint8Array): Uint8Array {
  return deflate(data)
}
