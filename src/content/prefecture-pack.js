/**
 * prefecture-pack.js ― 都道府県データを、エンジンが読める「教材パック」に変換する。
 *
 * ■ ここが差し替え点
 *   engine/ は都道府県を知らない。知っているのは Subject という共通の形だけ。
 *   世界地図・歴史人物・市町村などを追加したいときは、
 *   このファイルと同じ形のパックをもう1つ作れば、
 *   出題・採点・成長・戦闘の仕組みをそのまま使い回せる。
 *   （手順は docs/ADD-CONTENT.md）
 *
 * ■ Subject の形
 *   {
 *     id,
 *     answers: {
 *       name:    { kanji, kana, suffix },   // 主となる答え
 *       capital: { kanji, kana, suffix },   // 2つめの答え（無い教材なら省略可）
 *     },
 *     meta: { ... 画面表示に使う付加情報 }
 *   }
 */

import { PREFECTURES, PREFECTURE_BY_ID } from "./prefectures.js";
import { REGION_BY_ID } from "./regions.js";
import { normalize, toHiragana, acceptedForms } from "../utils/kana.js";
import { PATHS, BOUNDS, LABEL_POINTS } from "./pref-paths.js";

/** 教材パックの識別子。セーブデータの互換性判定に将来使う */
export const PACK_ID = "prefectures-jp";
export const PACK_NAME = "47都道府県";

/** PREFECTURES を Subject の配列に変換したもの */
export const SUBJECTS = PREFECTURES.map((prefecture) => {
  const region = REGION_BY_ID.get(prefecture.region);
  return {
    id: prefecture.id,
    answers: {
      name: {
        kanji: prefecture.name,
        kana: prefecture.reading,
        suffix: prefecture.suffix,
      },
      capital: {
        kanji: prefecture.capital,
        kana: prefecture.capitalReading,
        suffix: prefecture.capitalSuffix,
      },
    },
    meta: {
      region: prefecture.region,
      regionName: region?.name ?? "",
      regionColorVar: region?.colorVar ?? "--c-surface-2",
      specialty: prefecture.specialty,
      fact: prefecture.fact,
      population: prefecture.population,
      famous: prefecture.famous,
    },
  };
});

export const SUBJECT_BY_ID = new Map(SUBJECTS.map((s) => [s.id, s]));

/**
 * 入力された文字列が「別の都道府県／別の県庁所在地」を指していないか調べる。
 * scoring-engine に渡して、「それは千葉県だよ」という具体的な指摘を出すために使う。
 *
 * @param {string} text
 * @param {number} exceptId この id は除外する（正解の県そのもの）
 * @returns {{ id:number, label:string }|null}
 */
export function findOtherSubject(text, exceptId) {
  const target = normalize(text);
  if (target.length === 0) return null;
  const targetKana = toHiragana(target);

  for (const subject of SUBJECTS) {
    if (subject.id === exceptId) continue;
    const prefecture = PREFECTURE_BY_ID.get(subject.id);

    for (const [part, label] of [
      ["name", prefecture.name + prefecture.suffix],
      ["capital", prefecture.capital + prefecture.capitalSuffix],
    ]) {
      const forms = acceptedForms(subject.answers[part]);
      if (forms.kanji.includes(target) || forms.kana.includes(targetKana)) {
        return { id: subject.id, label };
      }
    }
  }
  return null;
}

/**
 * 地図データの健全性チェック（起動時に main.js から呼ぶ）。
 * データの取り違えは目で見つけにくく、起動時に気づけるのがいちばん早い。
 * @returns {string[]} 問題があればその説明。無ければ空配列
 */
export function validateMap(prefectureIds) {
  const problems = [];
  for (const id of prefectureIds) {
    if (!PATHS[id]) { problems.push(`id=${id} の地図の形がありません`); continue; }
    if (!PATHS[id].startsWith("M")) problems.push(`id=${id} のパスが不正です`);
    const bounds = BOUNDS[id];
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      problems.push(`id=${id} の大きさが取れません`);
    }
    if (!LABEL_POINTS[id]) problems.push(`id=${id} のラベル位置がありません`);
  }
  return problems;
}

/** Subject id から元の都道府県データを引く（画面表示用） */
export function prefectureOf(subjectId) {
  return PREFECTURE_BY_ID.get(subjectId) ?? null;
}
