import type { zh } from './zh'

export const zhTW = {
  home: '主頁',
  browse: '瀏覽',
  empty: '這個目錄裡沒有檔案',
  close: '關閉',
  unsaved: '有未儲存的修改。儲存、放棄，或取消。',
  dirty: '未儲存',
  save: '儲存',
  discard: '放棄',
  cancel: '取消',
  failed: '無法讀取這個目錄',
} satisfies Record<keyof typeof zh, string>
