/**
 * settings-screen.js ― せってい。
 *
 * 設定はすべて store.updateSettings() を通す。
 * そこから <html> の data 属性が書き換わり、CSS が見た目を切り替える。
 * つまりこの画面は「値を選ぶ」だけで、見た目を直接いじってはいない。
 *
 * アクセシビリティ関係（文字サイズ・色覚・ふりがな・利き手）を
 * おまけ扱いにせず、音や線の太さと同じ並びに置いている。
 */

import { el, clear, replace, announce } from "../../utils/dom.js";
import { listRecognizers } from "../../platform/recognition/recognizer.js";
import { PREFECTURE_IDS } from "../../content/prefectures.js";
import { MAP_ATTRIBUTION } from "../../content/pref-paths.js";
import { exportSave } from "../../core/save-manager.js";
import { downloadCsv } from "../../engine/analytics-engine.js";
import { toDateKey } from "../../core/store.js";

export function SettingsScreen({ store, router }) {
  const overlay = el("div", { class: "overlay-slot" });

  /** 設定を1つ変えて、その場で反映する */
  const set = (patch, message) => {
    store.updateSettings(patch);
    if (message) announce(message);
  };

  const nameInput = el("input", {
    type: "text",
    class: "text-input",
    value: store.player.name,
    maxlength: "12",
    "aria-label": "なまえ",
    onChange: (event) => {
      const name = event.target.value.trim() || "ゆうしゃ";
      store.update((save) => { save.player.name = name; });
    },
  });

  const root = el("div", { class: "screen settings-screen" },
    el("header", { class: "topbar" },
      el("button", { class: "btn btn--sub", onClick: () => router.back() }, "◀ もどる"),
      el("h2", { class: "topbar__title", "data-autofocus": "" }, "せってい")
    ),

    el("div", { class: "settings-screen__body scrollable" },

      el("div", { class: "panel" },
        el("h3", { class: "panel__title" }, "きみのこと"),
        el("div", { class: "option-group" },
          el("span", { class: "option-group__label" }, "なまえ"),
          nameInput)
      ),

      el("div", { class: "panel" },
        el("h3", { class: "panel__title" }, "見やすさ"),
        choiceRow("文字の大きさ", [
          { id: "small",  label: "小さい" },
          { id: "normal", label: "ふつう" },
          { id: "large",  label: "大きい" },
        ], store.settings.fontScale, (value) => set({ fontScale: value }, "文字の大きさを変えました")),

        choiceRow("ふりがな", [
          { id: true,  label: "つける" },
          { id: false, label: "つけない" },
        ], store.settings.furigana, (value) => set({ furigana: value })),

        choiceRow("色のみえかた", [
          { id: false, label: "ふつう" },
          { id: true,  label: "見分けやすい色" },
        ], store.settings.cvdMode, (value) => set({ cvdMode: value })),
        el("p", { class: "settings-note" },
          "○△×は 色だけでなく 形と文字でも しめしています。"),

        choiceRow("うごき", [
          { id: false, label: "ふつう" },
          { id: true,  label: "すくなめ" },
        ], store.settings.reduceMotion, (value) => set({ reduceMotion: value })),
        el("p", { class: "settings-note" },
          "アニメーションが 気になるときは「すくなめ」に。")
      ),

      el("div", { class: "panel" },
        el("h3", { class: "panel__title" }, "書きやすさ"),
        choiceRow("きき手", [
          { id: "right", label: "右きき" },
          { id: "left",  label: "左きき" },
        ], store.settings.handedness, (value) => set({ handedness: value })),
        el("p", { class: "settings-note" },
          "左ききにすると、ボタンが 手でかくれない位置に うつります。"),

        choiceRow("線の太さ", [
          { id: 4, label: "ほそい" },
          { id: 6, label: "ふつう" },
          { id: 9, label: "ふとい" },
        ], store.settings.penWidth, (value) => set({ penWidth: value })),

        choiceRow("丸つけのしかた",
          listRecognizers().map((r) => ({ id: r.id, label: r.label })),
          store.settings.recognizer,
          (value) => set({ recognizer: value })),
        el("p", { class: "settings-note" },
          "自動でうまく読めないときは、いつでも じぶんで丸つけできます。"),

        choiceRow("「県」「市」まで", [
          { id: false, label: "書かなくても○" },
          { id: true,  label: "書かないと△" },
        ], store.settings.requireSuffix, (value) => set({ requireSuffix: value })),
        el("p", { class: "settings-note" },
          "どちらの設定でも、「◯◯県」と最後まで書けたときは ボーナスの経験値がつきます。" +
          "まずは「書かなくても○」のまま、ほめて習慣づけるのがおすすめです。")
      ),

      el("div", { class: "panel" },
        el("h3", { class: "panel__title" }, "音"),
        choiceRow("こうかおん", [
          { id: true,  label: "鳴らす" },
          { id: false, label: "鳴らさない" },
        ], store.settings.sound, (value) => set({ sound: value }))
      ),

      el("div", { class: "panel" },
        el("h3", { class: "panel__title" }, "この教材について"),
        // 地図データの利用条件として、出典の表示が必要
        el("p", { class: "settings-note" }, MAP_ATTRIBUTION),
        el("p", { class: "settings-note" },
          "国土地理院「地球地図日本」の行政界データをもとに、" +
          "小学生が見やすいように簡略化して使っています。"),

        // その端末が最新かどうかを確かめるための版番号。
        // 「せっていの下に何て書いてある？」と聞けば分かる
        el("p", { class: "settings-note" }, `アプリの版：${appVersion()}`)
      ),

      el("div", { class: "panel" },
        el("h3", { class: "panel__title" }, "データ"),
        el("p", { class: "settings-note" },
          "記録は この端末の中だけに 保存されます。外には送られません。"),
        el("div", { class: "result-card__actions" },
          el("button", {
            class: "btn btn--sub",
            onClick: () => downloadCsv(
              `にっぽん冒険記_バックアップ_${toDateKey(new Date())}.json`,
              exportSave(store.save)),
          }, "きろくを 書き出す"),
          el("button", {
            class: "btn btn--danger",
            onClick: () => confirmReset(store, router, overlay),
          }, "きろくを ぜんぶ けす"))
      )
    ),

    overlay
  );

  return { root };
}

/* ---------------------------------------------------------------------------
 * 部品
 * ------------------------------------------------------------------------- */

/** ラベル＋択一トグルの1行 */
function choiceRow(label, options, current, onChange) {
  const row = el("div", { class: "option-group" },
    el("span", { class: "option-group__label" }, label));

  for (const option of options) {
    row.appendChild(el("button", {
      class: "toggle",
      "aria-pressed": String(option.id === current),
      onClick: (event) => {
        onChange(option.id);
        for (const button of row.querySelectorAll(".toggle")) {
          button.setAttribute("aria-pressed", String(button === event.currentTarget));
        }
      },
    }, option.label));
  }
  return row;
}

/**
 * 記録の全消去。
 * 学期ぶんの記録が一瞬で消える操作なので、
 * 「けす」と書かせる形にして、勢いで押せないようにしている。
 */
function confirmReset(store, router, overlay) {
  const input = el("input", {
    type: "text",
    class: "text-input",
    "aria-label": "けす と入力",
    placeholder: "けす",
  });
  const message = el("p", { class: "result-card__reading" },
    "レベル・図鑑・きろくが すべて消えます。もとには もどせません。");

  const submit = () => {
    if (input.value.trim() !== "けす") {
      replace(message, "「けす」と 入力してください。");
      return;
    }
    store.resetAll(PREFECTURE_IDS);
    clear(overlay);
    router.go("title", {}, { reset: true });
  };

  replace(overlay, el("div", {
    class: "modal-backdrop",
    onClick: (event) => { if (event.target.classList.contains("modal-backdrop")) clear(overlay); },
  },
    el("div", { class: "modal panel", role: "dialog", "aria-modal": "true" },
      el("h2", { "data-autofocus": "" }, "ほんとうに けしますか？"),
      message,
      el("p", {}, "消してよければ、下に「けす」と入力してください。"),
      input,
      el("div", { class: "result-card__actions" },
        el("button", { class: "btn btn--danger", onClick: submit }, "けす"),
        el("button", { class: "btn", onClick: () => clear(overlay) }, "やめる"))
    )
  ));
  input.focus();
}

/** index.html に書いてある版番号を読む（更新が届いたか確かめるため） */
function appVersion() {
  return document.querySelector('meta[name="app-version"]')?.content ?? "ふめい";
}
