import type { zh } from './zh'

export const es = {
  home: 'Inicio',
  browse: 'Examinar',
  empty: 'Esta carpeta no tiene archivos',
  close: 'Cerrar',
  unsaved: 'Este documento tiene cambios sin guardar. Guardar, descartar o cancelar.',
  dirty: 'Sin guardar',
  save: 'Guardar',
  discard: 'Descartar',
  cancel: 'Cancelar'
} satisfies Record<keyof typeof zh, string>