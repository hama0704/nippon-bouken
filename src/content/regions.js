/**
 * regions.js ― 地方（8地方区分＋沖縄）の定義。
 *
 * order が冒険の進行順。北から南へ旅する構成にしている。
 * color は CSS 変数名で持ち、実際の色は styles/tokens.css 側で決める
 * （色覚多様性モードに自動で追従させるため）。
 */

export const REGIONS = [
  { id: "hokkaido", name: "北海道",   reading: "ほっかいどう", order: 1, colorVar: "--c-region-hokkaido" },
  { id: "tohoku",   name: "東北",     reading: "とうほく",     order: 2, colorVar: "--c-region-tohoku"   },
  { id: "kanto",    name: "関東",     reading: "かんとう",     order: 3, colorVar: "--c-region-kanto"    },
  { id: "chubu",    name: "中部",     reading: "ちゅうぶ",     order: 4, colorVar: "--c-region-chubu"    },
  { id: "kinki",    name: "近畿",     reading: "きんき",       order: 5, colorVar: "--c-region-kinki"    },
  { id: "chugoku",  name: "中国",     reading: "ちゅうごく",   order: 6, colorVar: "--c-region-chugoku"  },
  { id: "shikoku",  name: "四国",     reading: "しこく",       order: 7, colorVar: "--c-region-shikoku"  },
  { id: "kyushu",   name: "九州",     reading: "きゅうしゅう", order: 8, colorVar: "--c-region-kyushu"   },
  { id: "okinawa",  name: "沖縄",     reading: "おきなわ",     order: 9, colorVar: "--c-region-okinawa"  },
];

/** id 引きの索引 */
export const REGION_BY_ID = new Map(REGIONS.map((r) => [r.id, r]));

/** 冒険の進行順（= REGIONS の並び順）の id 配列 */
export const REGION_ORDER = REGIONS.map((r) => r.id);

/** 地方名（「関東地方」の形）を返す */
export function regionFullName(regionId) {
  const region = REGION_BY_ID.get(regionId);
  return region ? `${region.name}地方` : "";
}
