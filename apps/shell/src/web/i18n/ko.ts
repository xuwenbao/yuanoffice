import type { zh } from './zh'

export const ko = {
  home: '홈',
  browse: '찾아보기',
  empty: '이 폴더에 파일이 없습니다',
  close: '닫기',
  unsaved: '저장하지 않은 변경 내용이 있습니다. 저장, 삭제 또는 취소하세요.',
  dirty: '저장 안 함',
  save: '저장',
  discard: '삭제',
  cancel: '취소',
  failed: '이 폴더를 읽을 수 없습니다',
} satisfies Record<keyof typeof zh, string>
