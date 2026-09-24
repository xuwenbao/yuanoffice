import type { zh } from './zh'

export const hi = {
  home: 'होम',
  browse: 'ब्राउज़',
  empty: 'इस फ़ोल्डर में कोई फ़ाइल नहीं है',
  close: 'बंद करें',
  unsaved: 'इस दस्तावेज़ में बिना सहेजे बदलाव हैं। सहेजें, छोड़ें, या रद्द करें।',
  dirty: 'सहेजा नहीं',
  save: 'सहेजें',
  discard: 'छोड़ें',
  cancel: 'रद्द करें',
  failed: 'इस फ़ोल्डर को पढ़ा नहीं जा सका'
} satisfies Record<keyof typeof zh, string>