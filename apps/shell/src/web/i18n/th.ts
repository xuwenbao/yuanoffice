import type { zh } from './zh'

export const th = {
  home: 'หน้าแรก',
  browse: 'เรียกดู',
  empty: 'โฟลเดอร์นี้ไม่มีไฟล์',
  close: 'ปิด',
  unsaved: 'เอกสารนี้มีการเปลี่ยนแปลงที่ยังไม่บันทึก บันทึก ทิ้ง หรือยกเลิก',
  dirty: 'ยังไม่บันทึก',
  save: 'บันทึก',
  discard: 'ทิ้ง',
  cancel: 'ยกเลิก',
  failed: 'อ่านโฟลเดอร์นี้ไม่ได้',
} satisfies Record<keyof typeof zh, string>
