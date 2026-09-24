import type { zh } from './zh'

export const he = {
  home: 'בית',
  browse: 'עיון',
  empty: 'אין קבצים בתיקייה זו',
  close: 'סגור',
  unsaved: 'למסמך זה יש שינויים שלא נשמרו. שמור, בטל או חזור.',
  dirty: 'לא נשמר',
  save: 'שמור',
  discard: 'בטל שינויים',
  cancel: 'חזור',
  failed: 'לא ניתן לקרוא את התיקייה הזו',
} satisfies Record<keyof typeof zh, string>
