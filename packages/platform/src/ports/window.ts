export interface TabInfo {
  id: string
  title: string
  focused: boolean
}

export interface WindowPort {
  onCloseCheck(handler: () => void): () => void
  reportCloseCheck(state: { dirty: boolean; autoSave: boolean; ref: string | null }): void
  onCloseSaveRequest(handler: () => void): () => void
  reportCloseSaveResult(ok: boolean): void
  openNewTab(ref?: string | null): Promise<void>
  listTabs(): Promise<TabInfo[]>
  focusTab(id: string): Promise<void>
}
