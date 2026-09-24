import type { zh } from './zh'

export const ms = {
  home: 'Laman utama',
  browse: 'Semak imbas',
  empty: 'Folder ini tiada fail',
  close: 'Tutup',
  unsaved: 'Dokumen ini mempunyai perubahan yang belum disimpan. Simpan, buang atau batal.',
  dirty: 'Belum disimpan',
  save: 'Simpan',
  discard: 'Buang',
  cancel: 'Batal',
  failed: 'Folder ini tidak dapat dibaca'
} satisfies Record<keyof typeof zh, string>