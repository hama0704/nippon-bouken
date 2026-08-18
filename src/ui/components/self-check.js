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
 * @param {boolean} [options.requireSuffix] 「県」まで書かないと○にしない設定か
 * @param {(judge:string, wroteSuffix:boolean) => void} options.onChoose
 * @returns {HTMLElement}
 */
export function SelfCheckPanel({ answer, inkImage, guess, requireSuffix = false, onChoose }) {
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

    el("p", {}, "どこまで 書けたかな？"),

    // ■ ボタンの文言に、実際の答えをそのまま入れる
    //   「かんじで書けた」のような抽象的な言い方だと、
    //   どこまでが合格なのか子どもには分からない。
    //   「広島県」と書いてあれば、見くらべてそのまま選べる。
    //
    // ■ 「県まで書けた」と「県を忘れた」を分ける
    //   機械が読んでいない自己採点でも、ボーナスを正しく出すため。
    //   どちらも正解なので○のままにし、優劣は経験値の差で伝える。
    el("div", { class: "selfcheck__choices" },
      choiceButton("maru", "○", `「${answer.kanji}${answer.suffix}」と 書けた`,
        Judge.MARU, true, onChoose),

      // 接尾辞がある答えのときだけ「県を書き忘れた」の選択肢を出す
      answer.suffix && choiceButton(
        requireSuffix ? "sankaku" : "maru",
        requireSuffix ? "△" : "○",
        `「${answer.kanji}」まで（「${answer.suffix}」を書きわすれた）`,
        requireSuffix ? Judge.SANKAKU : Judge.MARU, false, onChoose),

      choiceButton("sankaku", "△", "ひらがなで 書いた", Judge.SANKAKU, false, onChoose),
      choiceButton("batsu", "×", "まちがえた", Judge.BATSU, false, onChoose)
    ),

    el("p", { class: "result-card__reading" },
      "正直に えらぶほど、にがてな県が よく出てくるようになるよ。")
  );
}

/**
 * @param {boolean} wroteSuffix このボタンを選んだら「県まで書けた」とみなすか
 */
function choiceButton(variant, mark, caption, judge, wroteSuffix, onChoose) {
  return el("button", {
    class: `selfcheck__btn selfcheck__btn--${variant}`,
    onClick: () => onChoose(judge, wroteSuffix),
    "aria-label": `${mark} ${caption}`,
  },
    el("span", { class: "mark", "aria-hidden": "true" }, mark),
    el("span", { class: "caption" }, caption)
  );
}
