import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export interface AllowedRoots {
  roots: string[]
  /** Absolute path inside a root, after resolving the existing ancestor. */
  resolve(path: string): string
}

/**
 * Confine file access to the given directories. Symlinks are resolved before
 * the check, so a link inside a root cannot point outside it.
 */
export function resolveAllowed(roots: readonly string[]): AllowedRoots {
  const canonical = roots.map((root) => {
    const abs = resolve(root)
    try {
      return realpathSync(abs)
    } catch {
      return abs
    }
  })
  return {
    roots: canonical,
    resolve(path: string): string {
      if (!isAbsolute(path)) {
        throw new Error('path must be absolute')
      }
      const existing = deepestExisting(resolve(path))
      let realExisting: string
      try {
        realExisting = realpathSync(existing)
      } catch {
        throw new Error('outside_allowed_roots')
      }
      const suffix = relative(existing, resolve(path))
      const full = suffix ? resolve(realExisting, suffix) : realExisting
      if (!canonical.some((root) => inside(root, full) || inside(root, realExisting))) {
        throw new Error('outside_allowed_roots')
      }
      if (!canonical.some((root) => inside(root, full))) {
        throw new Error('outside_allowed_roots')
      }
      return full
    },
  }
}

function deepestExisting(path: string): string {
  let current = path
  for (;;) {
    try {
      statSync(current)
      return current
    } catch {
      const parent = resolve(current, '..')
      if (parent === current) return current
      current = parent
    }
  }
}

function inside(root: string, path: string): boolean {
  if (path === root) return true
  const rel = relative(root, path)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && !rel.split(sep).includes('..')
}
