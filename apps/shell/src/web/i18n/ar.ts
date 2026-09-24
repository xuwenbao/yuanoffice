import type { zh } from './zh'

export const ar = {
  home: 'الرئيسية',
  browse: 'استعراض',
  empty: 'لا توجد ملفات في هذا المجلد',
  close: 'إغلاق',
  unsaved: 'هذا المستند به تغييرات غير محفوظة. احفظها أو تجاهلها أو ألغِ.',
  dirty: 'غير محفوظ',
  save: 'حفظ',
  discard: 'تجاهل',
  cancel: 'إلغاء',
  failed: 'تعذر قراءة هذا المجلد'
} satisfies Record<keyof typeof zh, string>