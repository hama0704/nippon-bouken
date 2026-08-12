/**
 * title-screen.js ― 最初に出る画面。
 *
 * 「つづきから」はセーブがあるときだけ出す。
 * 背景の日本地図は、すでにクリアした県が地方色で光るようになっていて、
 * 起動した瞬間に「どれだけ進んだか」が一目で伝わる。
 */

import { el } from "../../utils/dom.js";
import { MapRenderer } from "../../map/map-renderer.js";
import { PREFECTURES } from "../../content/prefectures.js";

export function TitleScreen({ store, router }) {
  const hasSave = !store.session.isNewGame && store.stats.totalQuestions > 0;

  // 背景の地図は「見るだけ」。タップも県名ラベルも出さない。
  const map = new MapRenderer({ interactive: false, showLabels: false });
  for (const prefecture of PREFECTURES) {
    const record = store.progressOf(prefecture.id);
    const isCleared = record.nameCorrect > 0 || record.capCorrect > 0;
    map.setState(prefecture.id, isCleared ? "cleared" : "locked");
  }

  const root = el("div", { class: "screen title-screen" },
    el("div", { class: "title-screen__brand" },
      el("h1", { class: "title-screen__logo", "data-autofocus": "" }, "にっぽん冒険記"),
      el("p", { class: "title-screen__tagline" },
        "日本を旅して、47の都道府県を味方につけろ！"),

      el("div", { class: "title-screen__menu" },
        el("button", {
          class: "btn btn--lg btn--block",
          onClick: () => router.go("mode"),
        }, hasSave ? "つづきから" : "ぼうけんに でる"),

        hasSave && el("button", {
          class: "btn btn--sub btn--block",
          onClick: () => confirmRestart(store, router),
        }, "はじめから"),

        el("button", {
          class: "btn btn--sub btn--block",
          onClick: () => router.go("dex"),
        }, "としょかん（図鑑）"),

        el("button", {
          class: "btn btn--sub btn--block",
          onClick: () => router.go("records"),
        }, "きろく"),

        el("button", {
          class: "btn btn--sub btn--block",
          onClick: () => router.go("settings"),
        }, "せってい")
      ),

      hasSave && el("p", { class: "title-screen__save-info" },
        `レベル ${store.player.level} ／ ${store.stats.totalQuestions}問 ／ ` +
        `${store.stats.dayStreak}日れんぞく`)
    ),

    el("div", { class: "title-screen__map map-screen__stage" }, map.element)
  );

  return { root };
}

/**
 * 「はじめから」は取り返しがつかないので必ず確認する。
 * 教室で誤タップされると1学期ぶんの記録が消えるため、二段構えにしている。
 */
function confirmRestart(store, router) {
  const message =
    "いままでの きろくが すべて きえます。\n" +
    "ほんとうに さいしょから はじめますか？";
  if (!window.confirm(message)) return;
  if (!window.confirm("もういちど かくにん： きろくを けしても いいですか？")) return;

  store.resetAll(PREFECTURES.map((p) => p.id));
  router.go("title", {}, { reset: true });
}
