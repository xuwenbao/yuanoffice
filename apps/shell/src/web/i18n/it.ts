import type { zh } from './zh'

export const it = {
  home: 'Home',
  browse: 'Sfoglia',
  empty: 'Questa cartella non contiene file',
  close: 'Chiudi',
  unsaved: 'Questo documento ha modifiche non salvate. Salva, ignora o annulla.',
  dirty: 'Non salvato',
  save: 'Salva',
  discard: 'Ignora',
  cancel: 'Annulla'
} satisfies Record<keyof typeof zh, string>