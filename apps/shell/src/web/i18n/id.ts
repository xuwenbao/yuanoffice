import type { zh } from './zh'

export const id = {
  home: 'Beranda',
  browse: 'Telusuri',
  empty: 'Folder ini tidak berisi file',
  close: 'Tutup',
  unsaved: 'Dokumen ini memiliki perubahan yang belum disimpan. Simpan, buang, atau batal.',
  dirty: 'Belum disimpan',
  save: 'Simpan',
  discard: 'Buang',
  cancel: 'Batal',
  failed: 'Tidak dapat membaca folder ini',
} satisfies Record<keyof typeof zh, string>
