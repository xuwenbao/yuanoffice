export interface WebTab {
  id: string
  editorId: string
  path: string
  title: string
}

export function canonicalPath(path: string): string {
  const slash = path.replace(/\\/g, '/')
  if (slash.length > 1 && slash.endsWith('/')) return slash.slice(0, -1)
  return slash
}

export class TabRouteError extends Error {
  constructor(
    message: string,
    readonly candidates: string[],
  ) {
    super(message)
  }
}

/**
 * editor id, then canonical path, then tab id.
 * More than one match is an error that lists the candidates.
 */
export function resolveTab(tabs: readonly WebTab[], target: string): WebTab {
  const byEditor = tabs.find((tab) => tab.editorId === target)
  if (byEditor) return byEditor
  const wanted = canonicalPath(target)
  const byPath = tabs.filter((tab) => canonicalPath(tab.path) === wanted)
  if (byPath.length === 1) return byPath[0]!
  if (byPath.length > 1) {
    throw new TabRouteError(
      `more than one tab matches ${target}`,
      byPath.map((tab) => tab.id),
    )
  }
  const byId = tabs.filter((tab) => tab.id === target)
  if (byId.length === 1) return byId[0]!
  if (byId.length > 1) {
    throw new TabRouteError(
      `more than one tab id matches ${target}`,
      byId.map((tab) => tab.editorId),
    )
  }
  throw new TabRouteError(
    `no tab matches ${target}`,
    tabs.map((tab) => tab.editorId),
  )
}

export function editorKind(path: string): 'docs' | 'pdf' | 'slides' | 'sheets' | null {
  const lower = path.toLowerCase()
  if (lower.endsWith('.docx')) return 'docs'
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.pptx')) return 'slides'
  if (lower.endsWith('.xlsx')) return 'sheets'
  return null
}
