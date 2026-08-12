/**
 * mode-screen.js ― 学習モードと難易度を選ぶ画面。
 *
 * ここで決めた内容（QuizOptions）が question-engine への注文書になる。
 * 画面はオプションを組み立てるだけで、出題の仕組みは一切知らない。
 */

import { el, $$ } from "../../utils/dom.js";
import { REGIONS } from "../../content/regions.js";

/** 学習モードの定義。ここに1件足せば選択肢が増える */
const MODES = [
  {
    id: "name", num: "①", title: "都道府県モード",
    desc: "光っている県の名前を書こう。まずはここから！",
  },
  {
    id: "capital", num: "②", title: "県庁所在地モード",
    desc: "光っている県の県庁所在地を書こう。上級者むけ。",
  },
  {
    id: "both", num: "③", title: "そうごうモード",
    desc: "県の名前と県庁所在地の両方を書こう。腕だめし！",
  },
];

/** 難易度オプションの定義 */
const WRITING_OPTIONS = [
  { id: "any",   label: "かんじ・ひらがな どちらでも" },
  { id: "kanji", label: "かんじだけ（むずかしい）" },
];

const TIMER_OPTIONS = [
  { id: 0,  label: "じかん なし" },
  { id: 30, label: "30びょう" },
  { id: 15, label: "15びょう" },
];

export function ModeScreen({ store, router }) {
  // 前回の選択を初期値にする（毎回選び直させない）
  const state = {
    mode: store.session.mode ?? "name",
    writing: store.session.options?.writing ?? "any",
    timeLimit: store.session.options?.timeLimit ?? 0,
    regionFilter: store.session.options?.regionFilter ?? null,  // null = 全国
    reviewOnly: store.session.options?.reviewOnly ?? false,
  };

  /* --- モード選択カード --------------------------------------------------- */
  const modeList = el("div", { class: "mode-list", role: "radiogroup", "aria-label": "学習モード" },
    MODES.map((mode) =>
      el("button", {
        class: "mode-card",
        role: "radio",
        "aria-pressed": String(state.mode === mode.id),
        "aria-checked": String(state.mode === mode.id),
        dataset: { modeId: mode.id },
        onClick: () => {
          state.mode = mode.id;
          syncPressed(modeList, "modeId", mode.id);
        },
      },
        el("span", { class: "mode-card__num" }, mode.num),
        el("h3", { class: "mode-card__title" }, mode.title),
        el("p",  { class: "mode-card__desc" }, mode.desc)
      )
    )
  );

  /* --- オプション --------------------------------------------------------- */
  const writingGroup = toggleRow("書きかた", WRITING_OPTIONS, state.writing,
    (value) => { state.writing = value; });

  const timerGroup = toggleRow("せいげん時間", TIMER_OPTIONS, state.timeLimit,
    (value) => { state.timeLimit = value; });

  const regionOptions = [
    { id: null, label: "ぜんこく" },
    ...REGIONS.map((region) => ({ id: region.id, label: region.name })),
  ];
  const regionGroup = toggleRow("出題する地方", regionOptions, state.regionFilter,
    (value) => { state.regionFilter = value; });

  const reviewGroup = toggleRow("ふくしゅう", [
    { id: false, label: "ふつうに出す" },
    { id: true,  label: "にがてな県だけ" },
  ], state.reviewOnly, (value) => { state.reviewOnly = value; });

  /* --- 画面 --------------------------------------------------------------- */
  const root = el("div", { class: "screen mode-screen" },
    el("header", { class: "topbar" },
      el("button", { class: "btn btn--sub", onClick: () => router.back() }, "◀ もどる"),
      el("h2", { class: "topbar__title", "data-autofocus": "" }, "モードを えらぶ"),
      el("div", { class: "topbar__spacer" })
    ),

    el("div", { class: "mode-screen__body scrollable" },
      modeList,
      el("div", { class: "panel" },
        el("h3", { class: "panel__title" }, "むずかしさ"),
        writingGroup, timerGroup, regionGroup, reviewGroup
      )
    ),

    el("footer", { class: "mode-screen__footer" },
      el("button", {
        class: "btn btn--lg",
        onClick: () => {
          const options = {
            writing: state.writing,
            timeLimit: state.timeLimit,
            regionFilter: state.regionFilter,
            reviewOnly: state.reviewOnly,
          };
          store.updateSession({ mode: state.mode, options });
          router.go("adventure", { mode: state.mode, options });
        },
      }, "スタート ▶")
    )
  );

  return { root };
}

/* ---------------------------------------------------------------------------
 * 小さな部品
 * ------------------------------------------------------------------------- */

/**
 * ラベル＋トグルボタン群の1行を作る。
 * 値は id で比較する（null や false も選択肢として使えるよう JSON 文字列で持つ）。
 */
function toggleRow(label, options, selectedValue, onChange) {
  const row = el("div", { class: "option-group" },
    el("span", { class: "option-group__label" }, label)
  );

  for (const option of options) {
    const key = JSON.stringify(option.id);
    row.appendChild(el("button", {
      class: "toggle",
      "aria-pressed": String(option.id === selectedValue),
      dataset: { optionKey: key },
      onClick: () => {
        onChange(option.id);
        syncPressed(row, "optionKey", key);
      },
    }, option.label));
  }
  return row;
}

/** 同じグループ内のボタンの aria-pressed を1つだけ true にする */
function syncPressed(container, datasetKey, activeValue) {
  for (const button of $$(`[data-${toKebab(datasetKey)}]`, container)) {
    button.setAttribute("aria-pressed", String(button.dataset[datasetKey] === activeValue));
  }
}

const toKebab = (value) => value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
