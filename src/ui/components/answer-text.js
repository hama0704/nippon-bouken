/**
 * answer-text.js ― 答え（県名・県庁所在地）をふりがな付きで表示する。
 *
 * ■ なぜ専用の部品にするのか
 *   ruby("栃木県", "とちぎ") と書くと、3文字の上に4文字の読みが分散し、
 *   「県」の上にまで「ぎ」がはみ出してしまう。
 *   本体（栃木）と接尾辞（県）は別々の語なので、ルビも別々に振る必要がある。
 *
 *   　  とちぎ　けん          ← 正しい
 *   　  栃木　　県
 *
 *   　  と ち ぎ              ← まちがい（「県」に読みが乗っている）
 *   　  栃 木 県
 *
 *   同じ書き方を3画面（結果・自己確認・図鑑）で使うので、ここに集約している。
 */

import { el, ruby } from "../../utils/dom.js";
import { SUFFIX_READING } from "../../utils/kana.js";

/**
 * 答えをふりがな付きで組み立てる。
 * @param {{kanji:string, kana:string, suffix:string}} answer
 * @returns {DocumentFragment}
 */
export function answerRuby(answer) {
  const fragment = document.createDocumentFragment();

  // 本体（例: 栃木 / とちぎ）。
  // 「さいたま」のように答えがひらがなの場合、同じ読みを上に重ねても
  // 意味がないうえ行が詰まって読みにくいので、ふりがなを付けない。
  fragment.appendChild(answer.kanji === answer.kana
    ? document.createTextNode(answer.kanji)
    : ruby(answer.kanji, answer.kana));

  // 接尾辞（例: 県 / けん）。読みが分かるものだけルビを振る
  if (answer.suffix) {
    const reading = SUFFIX_READING[answer.suffix];
    fragment.appendChild(reading
      ? ruby(answer.suffix, reading)
      : document.createTextNode(answer.suffix));
  }
  return fragment;
}

/**
 * 都道府県データから直接組み立てる（図鑑で使う）。
 * @param {object} prefecture content/prefectures.js の1件
 * @param {"name"|"capital"} part
 */
export function prefectureRuby(prefecture, part = "name") {
  return part === "capital"
    ? answerRuby({
        kanji: prefecture.capital,
        kana: prefecture.capitalReading,
        suffix: prefecture.capitalSuffix,
      })
    : answerRuby({
        kanji: prefecture.name,
        kana: prefecture.reading,
        suffix: prefecture.suffix,
      });
}

/** 読み全体を1行で見せたいとき（例: 「よみ：とちぎけん」） */
export function fullReading(answer) {
  return answer.kana + (SUFFIX_READING[answer.suffix] ?? "");
}

/** ラベルと値を並べた行（図鑑の詳細で使う） */
export function labeledRow(label, value) {
  return el("div", { class: "dex-detail__row" },
    el("dt", {}, label),
    el("dd", {}, value)
  );
}
