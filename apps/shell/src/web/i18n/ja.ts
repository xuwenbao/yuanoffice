import type { zh } from './zh'

export const ja = {
  home: 'ホーム',
  browse: '参照',
  empty: 'このフォルダにファイルはありません',
  close: '閉じる',
  unsaved: '未保存の変更があります。保存、破棄、またはキャンセルしてください。',
  dirty: '未保存',
  save: '保存',
  discard: '破棄',
  cancel: 'キャンセル',
  failed: 'このフォルダを読み取れません'
} satisfies Record<keyof typeof zh, string>