/**
 * main.js ― アプリの起動口。
 *
 * ここでやることは3つだけ。
 *   1. 状態（Store）を用意する
 *   2. 画面（Screen）をルータに登録する
 *   3. 最初の画面を出す
 * ゲームのルールは engine/ に、見た目は ui/ にあり、ここには置かない。
 */

import { bus, Events } from "./core/event-bus.js";
import { Store, applySettingsToDocument } from "./core/store.js";
import { ScreenRouter } from "./core/screen-router.js";
import { el, replace } from "./utils/dom.js";

import { PREFECTURE_IDS } from "./content/prefectures.js";
import { validateShapes } from "./content/pref-shapes.js";

import { TitleScreen } from "./ui/screens/title-screen.js";
import { ModeScreen } from "./ui/screens/mode-screen.js";
import { AdventureScreen } from "./ui/screens/adventure-screen.js";
import { QuizScreen } from "./ui/screens/quiz-screen.js";
import { DexScreen } from "./ui/screens/dex-screen.js";
import { RecordsScreen } from "./ui/screens/records-screen.js";
import { SettingsScreen } from "./ui/screens/settings-screen.js";

import { AudioManager } from "./platform/audio-manager.js";
import { registerRecognizer } from "./platform/recognition/recognizer.js";
import { StrokeRecognizer } from "./platform/recognition/stroke-recognizer.js";
import { SelfCheckRecognizer } from "./platform/recognition/selfcheck-recognizer.js";

// 手書き認識エンジンを登録する。
// ここに1行足すだけで設定画面の選択肢が増える（README を参照）。
registerRecognizer(StrokeRecognizer);
registerRecognizer(SelfCheckRecognizer);

boot();

function boot() {
  const mountPoint = document.getElementById("screen-root");

  try {
    // 地図データの取り違え（マスの重複・抜け）は起動時に必ず検出する。
    // 作った直後は気づきにくく、後から探すと非常に時間を食うため。
    const problems = validateShapes(PREFECTURE_IDS);
    if (problems.length > 0) {
      console.warn("[map] 形状データに問題があります:\n" + problems.join("\n"));
    }

    const store = new Store(PREFECTURE_IDS);
    applySettingsToDocument(store.settings);

    // 効果音は EventBus を購読するだけで鳴る。
    // 画面側に「ここで音を出す」と書かなくてよいので、
    // 音を止めても消しても、ゲームの動きには一切影響しない。
    const audio = new AudioManager(store);

    const router = new ScreenRouter(mountPoint, { store, audio });

    router
      .register("title", TitleScreen)
      .register("mode", ModeScreen)
      .register("adventure", AdventureScreen)
      .register("quiz", QuizScreen)
      .register("dex", DexScreen)
      .register("records", RecordsScreen)
      .register("settings", SettingsScreen);

    router.go("title", {}, { reset: true });

    // アプリが背面に回るときは取りこぼさず保存する。
    // iPad ではタブを閉じても unload が呼ばれないことがあるため visibilitychange を使う。
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") store.flush();
    });
    window.addEventListener("pagehide", () => store.flush());

    registerServiceWorker();

    // 開発時にコンソールから状態を覗けるようにしておく
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      window.__game = { store, router, audio, bus, Events };
    }
  } catch (error) {
    // 起動に失敗しても真っ黒な画面で終わらせない。
    // 教室で使う以上、何が起きたかを画面に出すことが復旧の近道になる。
    console.error(error);
    replace(mountPoint, el("div", { class: "boot-message" },
      el("div", {},
        el("h2", {}, "うまく起動できませんでした"),
        el("p", {}, "ページを再読み込みしてみてください。"),
        el("pre", { class: "boot-message__detail" }, String(error?.stack ?? error))
      )
    ));
  }
}

/**
 * Service Worker の登録。
 * オフラインで動かすための仕組みだが、file:// で開いたときや
 * 未対応ブラウザでは黙って何もしない（起動を止めない）。
 */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((error) => {
      console.warn("[pwa] Service Worker を登録できませんでした:", error);
    });
  });
}
