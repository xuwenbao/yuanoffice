/** Copy bytes without a Node buffer type or a node import. */
export function asBytes(input: Uint8Array | ArrayBuffer): Uint8Array {
  if (input instanceof Uint8Array) return input
  return new Uint8Array(input)
}
