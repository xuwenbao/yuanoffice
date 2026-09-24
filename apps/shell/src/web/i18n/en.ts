import type { zh } from './zh'

export const en = {
  home: 'Home',
  browse: 'Browse',
  empty: 'This folder has no files',
  close: 'Close',
  unsaved: 'This document has unsaved changes. Save, discard, or cancel.',
  dirty: 'Unsaved',
  save: 'Save',
  discard: 'Discard',
  cancel: 'Cancel',
  failed: 'Could not read this folder'
} satisfies Record<keyof typeof zh, string>