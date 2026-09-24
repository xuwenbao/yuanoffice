import type { zh } from './zh'

export const ru = {
  home: 'Главная',
  browse: 'Обзор',
  empty: 'В этой папке нет файлов',
  close: 'Закрыть',
  unsaved: 'В документе есть несохраненные изменения. Сохранить, отменить или закрыть.',
  dirty: 'Не сохранено',
  save: 'Сохранить',
  discard: 'Отменить изменения',
  cancel: 'Закрыть',
  failed: 'Не удалось прочитать эту папку',
} satisfies Record<keyof typeof zh, string>
