/**
 * scoring-engine.js ― ○△× を決める。
 *
 * ■ 採点のきまり（先生の指定どおり）
 *     埼玉        → ○   漢字で正しい
 *     埼玉県      → ○   「県」は付けても付けなくてもよい
 *     さいたま    → △   読みは合っているがひらがな
 *     さいたまけん→ △   同上
 *     崎玉        → ×   漢字がちがう（ただし「おしい」と伝える）
 *     千葉        → ×   ちがう県
 *
 * ■ ここに置く理由
 *   採点ルールは学年や先生の方針で変わりうる、いちばん調整したくなる部分。
 *   1ファイルにまとめておけば、ここだけ読めば全部わかる。
 *   （変更手順は docs/CUSTOMIZE.md）
 *
 * ■ 教材への非依存
 *   この関数は「都道府県」を知らない。漢字とよみの組を渡されるだけなので、
 *   歴史人物でも世界の国名でもそのまま使える。
 */

import {
  normalize, toHiragana, acceptedForms, editDistance, isAllHiragana, containsKanji,
} from "../utils/kana.js";

/** 判定の種類 */
export const Judge = Object.freeze({
  MARU:    "maru",     // ○
  SANKAKU: "sankaku",  // △
  BATSU:   "batsu",    // ×
});

/** 画面に出す見た目（記号・ラベル・CSSクラス）をまとめて持つ */
export const JUDGE_VIEW = Object.freeze({
  [Judge.MARU]:    { mark: "○", label: "せいかい！",   className: "judge--maru" },
  [Judge.SANKAKU]: { mark: "△", label: "おしい！",     className: "judge--sankaku" },
  [Judge.BATSU]:   { mark: "×", label: "ざんねん…",   className: "judge--batsu" },
});

/**
 * 答え合わせをする。
 *
 * @param {string} inputText 読み取った（または子どもが入力した）文字列
 * @param {object} answer    { kanji, kana, suffix }
 * @param {object} [context]
 * @param {(text:string) => object|null} [context.findOther]
 *        入力が別の対象（別の県）と一致するか調べる関数。あれば具体的に指摘できる
 * @returns {{ judge:string, reason:string, message:string }}
 */
export function judgeAnswer(inputText, answer, context = {}) {
  const input = normalize(inputText);
  if (input.length === 0) {
    return result(Judge.BATSU, "empty", "なにも書けていないみたい。もういちど！");
  }

  // 「認める書き方」を答えのデータから組み立てる。
  // 入力の末尾から接尾辞を推測して削る、というやり方はしない
  // （「京都」の「都」まで削れてしまうため。kana.js のコメント参照）
  const forms = acceptedForms(answer);

  // --- ○: 漢字表記が一致（「県」の有無は問わない）-------------------------
  if (forms.kanji.includes(input)) {
    return result(Judge.MARU, "kanji", "かんぺき！かんじで書けたね。");
  }

  // --- 読みが一致（ひらがな・カタカナで書いた）-----------------------------
  if (forms.kana.includes(toHiragana(input))) {
    // 答えそのものがひらがなの場合（さいたま市など）は○にする
    if (isAllHiragana(forms.kanji[0])) {
      return result(Judge.MARU, "kanji", "かんぺき！");
    }
    return result(Judge.SANKAKU, "kana", "よみは あっているよ。つぎは かんじで書いてみよう！");
  }

  // --- 1文字だけちがう場合 -------------------------------------------------
  // 同じ長さの正解形とくらべる（「神奈川」とも「神奈川県」ともくらべる）
  const nearest = forms.kanji.find((form) => form.length === input.length);
  if (nearest && editDistance(input, nearest) === 1) {
    // ちがう1文字がひらがな → 漢字を思い出せなかっただけ。△にする
    if (hasKanaMismatch(input, nearest)) {
      return result(Judge.SANKAKU, "okurigana", "あと1文字！かんじを おもいだせるかな？");
    }
    if (containsKanji(input)) {
      return result(Judge.BATSU, "kanji-wrong",
        "おしい！かんじが 1つ ちがうよ。よく見てみよう。");
    }
  }

  // --- ×: ほかの対象と一致した（別の県を書いた）---------------------------
  const other = context.findOther?.(input);
  if (other) {
    return result(Judge.BATSU, "other", `それは「${other.label}」だよ。`);
  }

  // --- ×: それ以外 ---------------------------------------------------------
  return result(Judge.BATSU, "wrong", "ざんねん。正しい答えを おぼえよう！");
}

/**
 * 判定を経験値の種類に翻訳する。
 * 経験値そのものの計算は progress-engine が行う（役割を分けている）。
 */
export function isCorrect(judge) {
  return judge === Judge.MARU || judge === Judge.SANKAKU;
}

/* ---------------------------------------------------------------------------
 * 内部
 * ------------------------------------------------------------------------- */

function result(judge, reason, message) {
  return { judge, reason, message };
}

/** 違っている1文字が、入力側ではひらがなになっているか */
function hasKanaMismatch(input, target) {
  for (let i = 0; i < input.length; i++) {
    if (input[i] !== target[i]) return /[ぁ-ゟ]/.test(input[i]);
  }
  return false;
}
