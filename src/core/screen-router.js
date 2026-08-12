/**
 * screen-router.js ― 画面の切り替えとスタック管理。
 *
 * 画面は「関数」として定義する:
 *   function TitleScreen(ctx) {
 *     const root = el("div", { class: "screen" }, ...);
 *     return { root, destroy() { ... } };   // destroy は任意
 *   }
 *
 * router.go("title") で差し替え、router.back() で1つ戻る。
 * destroy() を必ず呼ぶことで、イベント購読やタイマーの後始末を強制する。
 */

import { bus, Events } from "./event-bus.js";
import { clear } from "../utils/dom.js";

export class ScreenRouter {
  #mountPoint;
  #screens = new Map();     // name -> factory
  #stack = [];              // [{ name, params }]
  #current = null;          // { name, params, instance }
  #context;                 // 各画面に渡す依存（store, router, engines...）

  constructor(mountPoint, context) {
    this.#mountPoint = mountPoint;
    this.#context = context;
  }

  /** 画面を登録する */
  register(name, factory) {
    this.#screens.set(name, factory);
    return this;
  }

  get currentName() { return this.#current?.name ?? null; }
  get canGoBack()   { return this.#stack.length > 0; }

  /**
   * 画面へ移動する。
   * @param {string} name
   * @param {object} [params] 画面へ渡す引数
   * @param {{ replace?: boolean, reset?: boolean }} [options]
   *        replace: 履歴を積まずに置き換える / reset: 履歴を捨てて起点にする
   */
  go(name, params = {}, options = {}) {
    const factory = this.#screens.get(name);
    if (!factory) {
      console.error(`[router] 未登録の画面: ${name}`);
      return;
    }

    if (options.reset) {
      this.#stack = [];
    } else if (this.#current && !options.replace) {
      this.#stack.push({ name: this.#current.name, params: this.#current.params });
    }

    this.#mount(name, params, factory);
  }

  /** 1つ前の画面へ戻る。戻れなければ false を返す */
  back() {
    const previous = this.#stack.pop();
    if (!previous) return false;
    const factory = this.#screens.get(previous.name);
    if (!factory) return false;
    this.#mount(previous.name, previous.params, factory);
    return true;
  }

  #mount(name, params, factory) {
    // 前の画面の後始末。ここを忘れるとリスナが積み上がって重くなる。
    this.#current?.instance?.destroy?.();
    clear(this.#mountPoint);

    const instance = factory({ ...this.#context, params, router: this });
    this.#mountPoint.appendChild(instance.root);
    this.#current = { name, params, instance };

    // 画面が変わったことをフォーカス位置でも伝える（キーボード／読み上げ対応）
    const focusTarget = instance.root.querySelector("[data-autofocus]")
      ?? instance.root.querySelector("h1, h2");
    focusTarget?.setAttribute("tabindex", "-1");
    focusTarget?.focus?.({ preventScroll: true });

    bus.emit(Events.SCREEN_CHANGED, { name, params });
  }
}
