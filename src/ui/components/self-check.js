/**
 * self-check.js ― 自分で丸つけをする画面。
 *
 * 出るのは2つの場合。
 *   1. 内蔵の文字認識が「自信がない」と判断したとき
 *   2. 設定で「じぶんで丸つけ」を選んでいるとき
 *
 * 機械が読めなかったことを子どものせいにしないため、
 * 文言は「読み取れなかった」ではなく「見くらべてみよう」にしている。
 *
 * 自分の字とお手本を並べて見比べる作業は、それ自体が有効な学習
 * （自己評価）なので、これは「しかたない代替手段」ではなく正式な学習手段。
 */

import { el } from "../../utils/dom.js";
import { answerRuby, fullReading } from "./answer-text.js";
import { Judge } from "../../engine/scoring-engine.js";

/**
 * @param {object} options
 * @param {object} options.answer     { kanji, kana, suffix }
 * @param {string} [options.inkImage] 手書きの画像（data URL）
 * @param {string} [options.guess]    認識エンジンの推測（あれば参考に出す）
 * @param {(judge:string) => void} options.onChoose
 * @returns {HTMLElement}
 */
export function SelfCheckPanel({ answer, inkImage, guess, onChoose }) {
  return el("div", { class: "selfcheck" },
    el("h2", {}, "こたえと 見くらべてみよう"),

    el("div", { class: "panel" },
      el("p", { class: "result-card__answer" }, answerRuby(answer)),
      el("p", { class: "result-card__reading" }, `よみ：${fullReading(answer)}`)
    ),

    // 自分が書いた字（あれば）
    inkImage && el("div", { class: "panel panel--flat" },
      el("p", { class: "result-card__reading" }, "じぶんが 書いた字"),
      el("img", {
        src: inkImage,
        alt: "自分が書いた答え",
        style: { width: "100%", borderRadius: "8px", background: "#fffdf7" },
      })
    ),

    // 認識エンジンが何か推測できていれば参考として出す（決めつけない）
    guess && el("p", { class: "result-card__reading" },
      `もしかして「${guess}」かな？ ちがっていたら 自分で えらんでね。`),

    el("p", {}, "どうだったかな？"),

    el("div", { class: "selfcheck__choices" },
      choiceButton("maru", "○", "かんじで 書けた", Judge.MARU, onChoose),
      choiceButton("sankaku", "△", "ひらがな・おしい", Judge.SANKAKU, onChoose),
      choiceButton("batsu", "×", "まちがえた", Judge.BATSU, onChoose)
    ),

    el("p", { class: "result-card__reading" },
      "正直に えらぶほど、にがてな県が よく出てくるようになるよ。")
  );
}

function choiceButton(variant, mark, caption, judge, onChoose) {
  return el("button", {
    class: `selfcheck__btn selfcheck__btn--${variant}`,
    onClick: () => onChoose(judge),
    "aria-label": `${mark} ${caption}`,
  },
    el("span", { class: "mark", "aria-hidden": "true" }, mark),
    el("span", { class: "caption" }, caption)
  );
}
