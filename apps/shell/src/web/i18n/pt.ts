import type { zh } from './zh'

export const pt = {
  home: 'Início',
  browse: 'Procurar',
  empty: 'Esta pasta não tem arquivos',
  close: 'Fechar',
  unsaved: 'Este documento tem alterações não salvas. Salvar, descartar ou cancelar.',
  dirty: 'Não salvo',
  save: 'Salvar',
  discard: 'Descartar',
  cancel: 'Cancelar'
} satisfies Record<keyof typeof zh, string>