/**
 * enemies.js ― 地方ごとの敵の定義。
 *
 * ■ 構成
 *   1つの地方に「ざこ2体 → 中ボス1体」。これを北から順に9地方ぶん。
 *   9地方すべてを制覇すると魔王が現れる。
 *
 * ■ 強さの決め方
 *   名前は手で付け、HPと攻撃力は地方の順番から自動計算している。
 *   数十体ぶんの数字を手で管理すると必ずバランスが崩れるため、
 *   「北へ行くほど強い」という関係を式で保証している。
 *   全体を難しく／やさしくしたいときは BALANCE の数字を1つ変えるだけでよい。
 *   （手順は docs/ADD-ENEMY.md）
 */

import { REGIONS, REGION_BY_ID } from "./regions.js";

/**
 * 難易度の調整つまみ。
 *
 * 目安: プレイヤーの攻撃力は Lv1 で 8、レベルが1上がるごとに +3。
 *       1問正解でおよそ「攻撃力ぶん」のダメージが出る。
 *       ざこ1体を 3〜4問、中ボスを 6〜8問で倒せるくらいを狙っている。
 */
export const BALANCE = {
  minionHp:      { base: 26, perRegion: 16 },  // ざこのHP
  bossHp:        { base: 70, perRegion: 46 },  // 中ボスのHP
  // 攻撃力は「プレイヤーの守備力の伸び」より速く上げること。
  // 遅いと後半で反撃が痛くなくなり、HPの意味が消えてしまう。
  minionAtk:     { base: 4,  perRegion: 2.4 }, // ざこの攻撃力
  bossAtk:       { base: 8,  perRegion: 3.6 },
  demonLordHp:   520,
  demonLordAtk:  38,
};

/** 地方ごとの見た目と名前。ここが「その地方らしさ」を決める */
const REGION_THEMES = {
  hokkaido: { art: "snow",    names: ["こゆきだま", "つらら坊",   "ブリザードキング"] },
  tohoku:   { art: "oni",     names: ["こおに",     "あかおに",   "なまはげ大王"] },
  kanto:    { art: "machine", names: ["ハグルマ兵", "スチームロボ", "キカイ司令官"] },
  chubu:    { art: "dragon",  names: ["こりゅう",   "やまりゅう", "アルプスドラゴン"] },
  kinki:    { art: "ninja",   names: ["下忍",       "中忍",       "忍者がしら"] },
  chugoku:  { art: "youkai",  names: ["からかさ小僧", "ぬりかべ", "妖怪の頭領"] },
  shikoku:  { art: "spirit",  names: ["こだま",     "うずしおの精霊", "四国のぬし"] },
  kyushu:   { art: "volcano", names: ["ひのこ",     "マグマくん", "火山の主"] },
  okinawa:  { art: "sea",     names: ["さんごヒトデ", "うみへび", "シーサー魔神"] },
};

/** 1地方ぶんの敵3体を作る */
function buildRegionEnemies(region) {
  const theme = REGION_THEMES[region.id];
  const step = region.order - 1;   // 北海道=0, 東北=1, ...

  const make = (index, tier) => {
    const isBoss = tier === "boss";
    const hpRule  = isBoss ? BALANCE.bossHp  : BALANCE.minionHp;
    const atkRule = isBoss ? BALANCE.bossAtk : BALANCE.minionAtk;
    // ざこの2体目は1体目より少し強い
    const bump = !isBoss && index === 1 ? 1.35 : 1;

    return {
      id: `${region.id}-${index}`,
      name: theme.names[index],
      region: region.id,
      regionName: region.name,
      art: theme.art,
      colorVar: region.colorVar,
      tier,
      maxHp: Math.round((hpRule.base + hpRule.perRegion * step) * bump),
      atk: Math.round((atkRule.base + atkRule.perRegion * step) * bump),
    };
  };

  return [make(0, "normal"), make(1, "normal"), make(2, "boss")];
}

/** 地方 id → 敵の配列（戦う順） */
export const ENEMIES_BY_REGION = Object.fromEntries(
  REGIONS.map((region) => [region.id, buildRegionEnemies(region)])
);

/** ラスボス */
export const DEMON_LORD = {
  id: "demon-lord",
  name: "にっぽん魔王",
  region: null,
  regionName: "まおうのしろ",
  art: "demon",
  colorVar: "--c-judge-batsu",
  tier: "final",
  maxHp: BALANCE.demonLordHp,
  atk: BALANCE.demonLordAtk,
};

/** すべての敵（図鑑や集計で使う） */
export const ALL_ENEMIES = [
  ...Object.values(ENEMIES_BY_REGION).flat(),
  DEMON_LORD,
];

/**
 * 地方と何体目かから敵を引く。
 * @param {string|null} regionId null なら魔王
 * @param {number} index
 */
export function enemyAt(regionId, index) {
  if (regionId === null) return DEMON_LORD;
  const list = ENEMIES_BY_REGION[regionId];
  if (!list) return null;
  return list[index] ?? null;
}

/** その地方の敵が何体いるか */
export function enemyCountOf(regionId) {
  return ENEMIES_BY_REGION[regionId]?.length ?? 0;
}

/** 敵が出てくるときのセリフ。地方の特色を一言そえる */
export function encounterLine(enemy) {
  if (enemy.tier === "final") return "ついに あらわれた… にっぽん魔王！";
  if (enemy.tier === "boss") {
    return `${enemy.regionName}地方の ボス「${enemy.name}」が 立ちはだかる！`;
  }
  const region = REGION_BY_ID.get(enemy.region);
  return `${region?.name ?? ""}地方で「${enemy.name}」が あらわれた！`;
}
