/**
 * Read a preload global once. App adapters call this; renderer features do not.
 * Returns null when the page has no preload (the browser host, or a unit test).
 */
export function readPreloadGlobal<T>(name: string): T | null {
  const host = globalThis as unknown as Record<string, unknown>
  const value = host[name]
  if (!value || typeof value !== 'object') return null
  return value as T
}

export function displayName(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return slash >= 0 ? path.slice(slash + 1) : path
}
