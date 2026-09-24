import type { zh } from './zh'

export const cs = {
  home: 'Domů',
  browse: 'Procházet',
  empty: 'Tato složka neobsahuje soubory',
  close: 'Zavřít',
  unsaved: 'Tento dokument má neuložené změny. Uložit, zahodit nebo zrušit.',
  dirty: 'Neuloženo',
  save: 'Uložit',
  discard: 'Zahodit',
  cancel: 'Zrušit',
  failed: 'Tuto složku nelze načíst',
} satisfies Record<keyof typeof zh, string>
