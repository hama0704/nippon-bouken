/**
 * map-renderer.js ― 日本地図の SVG を組み立てて操作する。
 *
 * 外から見た使い方:
 *   const map = new MapRenderer({ onSelect: (id) => ... });
 *   container.appendChild(map.element);
 *   map.setState(13, "target");     // 東京を出題中の色にする
 *   map.focusOn(13);                // 東京へズーム
 *
 * 形のデータ（content/pref-paths.js）と描画をここで分けているので、
 * 地図を作り直しても直すのはこのファイルだけで済む。
 */

import { el } from "../utils/dom.js";
import { PREFECTURES, fullName } from "../content/prefectures.js";
import { REGION_BY_ID } from "../content/regions.js";
import {
  PATHS, BOUNDS, LABEL_POINTS, VIEW_WIDTH, VIEW_HEIGHT, INSET_BOX, MAP_ATTRIBUTION,
} from "../content/pref-paths.js";

/** 拡大の下限（viewBox の幅）。これ以上は寄れない */
const MIN_VIEW_WIDTH = VIEW_WIDTH * 0.06;
/** 縮小の上限。日本全体より少し引いたところで止める */
const MAX_VIEW_WIDTH = VIEW_WIDTH * 1.4;

/** 県名ラベルの大きさ（画面上のpx）。ズームしても見た目は変わらない */
const LABEL_FONT_PX = 11;
/** これ以上動いたら「なぞった」とみなし、県のタップとして扱わない */
const DRAG_THRESHOLD_PX = 6;

export class MapRenderer {
  /** @type {HTMLElement} 地図とボタンをまとめた枠 */
  element;
  /** @type {SVGSVGElement} */
  #svg;
  #paths = new Map();     // prefectureId -> <path>
  #labels = new Map();    // prefectureId -> <text>
  #viewport;              // ズーム・パン用の <g>
  #onSelect;
  #interactive;
  #showLabels = true;
  /** なぞって動かしている最中の指の情報 */
  #pointers = new Map();
  #dragged = false;
  #resizeObserver = null;

  /**
   * @param {object} options
   * @param {(prefectureId:number) => void} [options.onSelect] 県をタップしたとき
   * @param {boolean} [options.interactive=true] false なら見るだけ（クイズの出題図など）
   * @param {boolean} [options.showLabels=true] 県名ラベルを出すか
   * @param {boolean} [options.panZoom=true] 指でなぞって動かす・つまんで拡大できるようにするか
   */
  constructor({ onSelect, interactive = true, showLabels = true, panZoom = true } = {}) {
    this.#onSelect = onSelect;
    this.#interactive = interactive;
    this.#svg = this.#build(showLabels);

    // 地図は SVG 単体ではなく枠で包む。
    // 「ぜんたい」「＋」「−」のボタンを地図の上に重ねて置くため。
    this.element = el("div", { class: "map-frame" }, this.#svg);

    if (panZoom) {
      this.#enablePanZoom();
      this.element.appendChild(this.#buildControls());
      this.element.appendChild(this.#buildHint());
    }

    // 地図の表示サイズが決まってからでないとラベルの大きさを計算できない。
    //
    // ResizeObserver だけに任せない。環境によっては発火しないことがあり
    // （実際、開発中に使ったプレビュー用ブラウザでは一度も発火しなかった）、
    // そうなるとラベルが全部出っぱなしになって地図が読めなくなる。
    // 画面に貼られた直後に自分でも1回呼ぶ。何度呼んでも結果は同じ。
    this.#resizeObserver = new ResizeObserver(() => this.#updateLabels());
    this.#resizeObserver.observe(this.element);
    requestAnimationFrame(() => this.#updateLabels());
    setTimeout(() => this.#updateLabels(), 120);
  }

  #build(showLabels) {
    this.#viewport = el("g", { class: "map-viewport" });
    this.#showLabels = showLabels;

    // 沖縄の別枠（点線の囲み）。本島は本土から1000km以上はなれているため、
    // 実際の位置に描くと日本全体がとても小さくなってしまう
    this.#viewport.appendChild(
      el("rect", {
        class: "map-inset",
        x: INSET_BOX.x, y: INSET_BOX.y,
        width: INSET_BOX.width, height: INSET_BOX.height,
        rx: 6,
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 1.5,
        "stroke-dasharray": "8 6",
        opacity: "0.45",
        "vector-effect": "non-scaling-stroke",
      })
    );

    for (const prefecture of PREFECTURES) {
      const d = PATHS[prefecture.id];
      if (!d) continue;

      const region = REGION_BY_ID.get(prefecture.region);
      const path = el("path", {
        class: "pref",
        d,
        style: { "--pref-color": `var(${region?.colorVar ?? "--c-surface-2"})` },
        dataset: { prefId: prefecture.id, region: prefecture.region, state: "default" },
        // 拡大しても県境の太さが変わらないようにする
        "vector-effect": "non-scaling-stroke",
        // 地図を音声読み上げでも使えるようにする
        role: this.#interactive ? "button" : "img",
        tabindex: this.#interactive ? "0" : null,
        "aria-label": `${fullName(prefecture)}（${region?.name ?? ""}地方）`,
      });

      if (this.#interactive) {
        path.addEventListener("click", () => this.#onSelect?.(prefecture.id));
        path.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            this.#onSelect?.(prefecture.id);
          }
        });
      }

      this.#viewport.appendChild(path);
      this.#paths.set(prefecture.id, path);
    }

    // ラベルは県の形の上に重ねたいので、すべての県を描いたあとに作る
    if (showLabels) {
      for (const prefecture of PREFECTURES) {
        const point = LABEL_POINTS[prefecture.id];
        if (!point) continue;
        const label = el("text", {
          class: "pref-label",
          x: point.x, y: point.y,
        }, prefecture.name);
        this.#viewport.appendChild(label);
        this.#labels.set(prefecture.id, label);
      }
    }

    const svg = el("svg", {
      class: "map-view",
      viewBox: `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`,
      preserveAspectRatio: "xMidYMid meet",
      role: "group",
      "aria-label": "日本地図",
    }, this.#viewport);

    // 地図データの出典。利用条件として表示が必要
    svg.appendChild(el("title", {}, `日本地図（${MAP_ATTRIBUTION}）`));
    return svg;
  }

  /* --- 見た目の操作 ------------------------------------------------------ */

  /**
   * 県の状態を変える。
   * @param {number} prefectureId
   * @param {"default"|"locked"|"cleared"|"target"|"weak"} state
   */
  setState(prefectureId, state) {
    const path = this.#paths.get(prefectureId);
    if (path) path.dataset.state = state;
  }

  /**
   * 県の色を直接指定する（習熟度のヒートマップなどで使う）。
   * 地方の色より優先される。
   * @param {number} prefectureId
   * @param {string} color CSS の色。null を渡すと地方の色に戻る
   */
  setColor(prefectureId, color) {
    const path = this.#paths.get(prefectureId);
    if (!path) return;
    if (color) {
      path.style.setProperty("--pref-color", color);
      path.dataset.state = "cleared";
    } else {
      path.style.removeProperty("--pref-color");
    }
  }

  /** まとめて状態を設定する。map: Map<id, state> または { id: state } */
  setStates(map) {
    const entries = map instanceof Map ? map.entries() : Object.entries(map);
    for (const [id, state] of entries) this.setState(Number(id), state);
  }

  /** すべて既定状態に戻す */
  resetStates(state = "default") {
    for (const id of this.#paths.keys()) this.setState(id, state);
  }

  /** ラベルの表示・非表示（出題中は答えが見えてしまうので消す） */
  setLabelsVisible(visible) {
    for (const label of this.#labels.values()) {
      label.style.display = visible ? "" : "none";
    }
  }

  /** 特定の県だけラベルを出す（結果画面で正解を示すとき） */
  showLabelOnly(prefectureId) {
    for (const [id, label] of this.#labels) {
      label.style.display = id === prefectureId ? "" : "none";
    }
  }

  /* --- ズーム ------------------------------------------------------------ */

  /**
   * 指定した県が画面いっぱいに近づくようズームする。
   * 出題時に「どこを答えるのか」を分かりやすくするために使う。
   * @param {number} prefectureId
   * @param {number} [padding=1.4] まわりに残す余白（その県の大きさの何倍か）
   */
  focusOn(prefectureId, padding = 1.4) {
    const bounds = BOUNDS[prefectureId];
    if (!bounds) return;

    // 県の大きさに比例した余白をとる。
    // 東京のような小さな県でも、まわりの県がいっしょに見えて
    // 「日本のどのあたりか」が分かるようにするため。
    const size = Math.max(bounds.width, bounds.height);
    const pad = size * padding;
    const width = bounds.width + pad * 2;
    const height = bounds.height + pad * 2;

    this.setViewBox(bounds.x - pad, bounds.y - pad, width, height);
  }

  /** 日本全体が見える状態に戻す */
  resetZoom() {
    this.setViewBox(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  }

  /**
   * 県名ラベルの見せ方を、いまのズームに合わせて調整する。
   *
   * ・文字の大きさは画面上で一定（ズームしても読める大きさのまま）
   * ・その県に文字が収まらないときは出さない
   *   → 拡大すると、それまで狭くて出せなかった県の名前が現れる
   *
   * 収まらないのに出すと、となりの県の上に名前が重なって読めなくなる。
   */
  #updateLabels() {
    if (!this.#showLabels || this.#labels.size === 0) return;
    const unitsPerPixel = this.#unitsPerPixel();
    const fontSize = LABEL_FONT_PX * unitsPerPixel;

    for (const [id, label] of this.#labels) {
      const point = LABEL_POINTS[id];
      const name = label.textContent ?? "";
      // 文字列の半分の長さが、海岸線までの距離に収まるか
      const needed = (name.length * fontSize) / 2;
      const fits = point.r >= needed * 0.85;

      label.style.display = fits ? "" : "none";
      if (fits) label.setAttribute("font-size", fmt(fontSize));
    }
  }

  /**
   * viewBox をアニメーション付きで変更する。
   * SVG の viewBox は CSS transition が効かないので、
   * requestAnimationFrame で自前に補間する。
   */
  setViewBox(x, y, width, height, durationMs = 420) {
    const from = this.#svg.viewBox.baseVal;
    const start = { x: from.x, y: from.y, w: from.width, h: from.height };
    const to = { x, y, w: width, h: height };

    // 一気に切り替える条件:
    //   ・「動きを減らす」設定のとき
    //   ・画面が表示されていないとき（requestAnimationFrame が呼ばれず、
    //     途中の viewBox のまま固まってしまうため）
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches
      || document.documentElement.dataset.motion === "reduce"
      || document.hidden;
    if (reduceMotion || durationMs <= 0) {
      this.#svg.setAttribute("viewBox", `${to.x} ${to.y} ${to.w} ${to.h}`);
      this.#updateLabels();
      return;
    }

    const startedAt = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const e = 1 - Math.pow(1 - t, 3);   // ease-out cubic
      const cx = start.x + (to.x - start.x) * e;
      const cy = start.y + (to.y - start.y) * e;
      const cw = start.w + (to.w - start.w) * e;
      const ch = start.h + (to.h - start.h) * e;
      this.#svg.setAttribute("viewBox", `${cx} ${cy} ${cw} ${ch}`);
      this.#updateLabels();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** 県の <path> 要素を取り出す（演出で直接触りたいとき用） */
  pathOf(prefectureId) {
    return this.#paths.get(prefectureId) ?? null;
  }

  /** 画面から外すときに呼ぶ（監視を残すと画面を移るたびに積み上がる） */
  destroy() {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
  }

  /* --- 指でなぞって動かす・つまんで拡大する --------------------------------
   *
   * ■ なぜ必要か
   *   出題のときは答えの県に寄るので、画面には日本の一部しか映らない。
   *   「その県が日本のどのあたりか」をつかみたい子は、まわりを見たくなる。
   *   見えない部分を見に行けないと、位置を覚える手がかりが減ってしまう。
   *
   * ■ 指1本でなぞる＝動かす、2本でつまむ＝拡大縮小
   *   紙の地図を手で動かすのと同じ感覚。説明しなくても伝わる操作にしている。
   * ---------------------------------------------------------------------- */

  #enablePanZoom() {
    const svg = this.#svg;

    svg.addEventListener("pointerdown", (event) => {
      this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.#dragged = false;
      try { svg.setPointerCapture(event.pointerId); } catch { /* 続行 */ }
    });

    svg.addEventListener("pointermove", (event) => {
      const previous = this.#pointers.get(event.pointerId);
      if (!previous) return;
      event.preventDefault();

      const current = { x: event.clientX, y: event.clientY };
      const points = [...this.#pointers.values()];

      if (this.#pointers.size >= 2) {
        // 2本指：つまんだ間隔の変化で拡大縮小する
        const others = points.filter((p) => p !== previous);
        const anchor = others[0];
        const before = Math.hypot(previous.x - anchor.x, previous.y - anchor.y);
        const after = Math.hypot(current.x - anchor.x, current.y - anchor.y);
        if (before > 4 && after > 4) {
          const midpoint = { x: (current.x + anchor.x) / 2, y: (current.y + anchor.y) / 2 };
          this.#zoomAt(before / after, midpoint);
        }
      } else {
        // 1本指：動かした距離ぶんだけ地図をずらす
        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
          this.#dragged = true;
        }
        const scale = this.#unitsPerPixel();
        this.#applyViewBox(
          this.#view.x - dx * scale,
          this.#view.y - dy * scale,
          this.#view.width,
          this.#view.height
        );
      }

      this.#pointers.set(event.pointerId, current);
    });

    const release = (event) => {
      this.#pointers.delete(event.pointerId);
      try { svg.releasePointerCapture(event.pointerId); } catch { /* 続行 */ }
    };
    svg.addEventListener("pointerup", release);
    svg.addEventListener("pointercancel", release);
    svg.addEventListener("pointerleave", release);

    // なぞったあとの click は「県を選んだ」ではないので握りつぶす。
    // これが無いと、地図を動かすたびに県が選ばれてしまう。
    svg.addEventListener("click", (event) => {
      if (this.#dragged) {
        event.stopPropagation();
        event.preventDefault();
        this.#dragged = false;
      }
    }, true);

    // パソコンではホイールでも拡大縮小できるようにする
    svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.#zoomAt(event.deltaY > 0 ? 1.15 : 1 / 1.15, { x: event.clientX, y: event.clientY });
    }, { passive: false });
  }

  /** ボタン（ぜんたい・拡大・縮小） */
  #buildControls() {
    const button = (label, aria, onClick) => el("button", {
      class: "map-controls__btn",
      type: "button",
      "aria-label": aria,
      onClick: (event) => { event.stopPropagation(); onClick(); },
    }, label);

    return el("div", { class: "map-controls" },
      button("ぜんたい", "日本全体をひょうじ", () => this.resetZoom()),
      button("＋", "地図を大きくする", () => this.#zoomAt(1 / 1.4, this.#centerPoint())),
      button("−", "地図を小さくする", () => this.#zoomAt(1.4, this.#centerPoint()))
    );
  }

  /**
   * 動かせることに気づいてもらうための小さな案内。
   * 操作できると分からなければ、機能が無いのと同じになってしまう。
   */
  #buildHint() {
    return el("div", { class: "map-hint", "aria-hidden": "true" }, "ゆびで うごかせるよ");
  }

  /** いまの viewBox */
  get #view() {
    const v = this.#svg.viewBox.baseVal;
    return { x: v.x, y: v.y, width: v.width, height: v.height };
  }

  /** 画面の1ピクセルが、地図の何単位にあたるか */
  #unitsPerPixel() {
    const rect = this.#svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return 1;
    // preserveAspectRatio="meet" なので、はみ出さないほうの比率が実際の縮尺になる
    return Math.max(this.#view.width / rect.width, this.#view.height / rect.height);
  }

  /** 画面中央の座標（ボタンで拡大縮小するときの基準） */
  #centerPoint() {
    const rect = this.#svg.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  /**
   * ある画面上の点を動かさないまま、拡大率を変える。
   * つまんだ指の間や画面の中心が基準になるので、見ている場所を見失わない。
   * @param {number} factor 1より大きいと縮小、小さいと拡大
   * @param {{x:number,y:number}} clientPoint 画面座標の基準点
   */
  #zoomAt(factor, clientPoint) {
    const view = this.#view;
    const rect = this.#svg.getBoundingClientRect();
    if (rect.width === 0) return;

    const targetWidth = clamp(view.width * factor, MIN_VIEW_WIDTH, MAX_VIEW_WIDTH);
    const actual = targetWidth / view.width;
    if (Math.abs(actual - 1) < 0.001) return;

    // 基準点の地図上の位置を求め、拡大後もそこが同じ画面位置に来るようにする
    const scale = this.#unitsPerPixel();
    const mapX = view.x + (clientPoint.x - rect.left - (rect.width - view.width / scale) / 2) * scale;
    const mapY = view.y + (clientPoint.y - rect.top - (rect.height - view.height / scale) / 2) * scale;

    this.#applyViewBox(
      mapX - (mapX - view.x) * actual,
      mapY - (mapY - view.y) * actual,
      view.width * actual,
      view.height * actual
    );
  }

  /**
   * viewBox を設定する。
   * 遠くまで行きすぎて地図を見失わないよう、範囲をしばる。
   */
  #applyViewBox(x, y, width, height) {
    const mapWidth = GRID_COLS * CELL;
    const mapHeight = GRID_ROWS * CELL;
    // 地図の端まで行っても、画面の半分は陸が残るようにする
    const marginX = width / 2;
    const marginY = height / 2;

    const clampedX = clamp(x, -marginX, mapWidth - width + marginX);
    const clampedY = clamp(y, -marginY, mapHeight - height + marginY);

    this.#svg.setAttribute("viewBox", `${fmt(clampedX)} ${fmt(clampedY)} ${fmt(width)} ${fmt(height)}`);
    this.#updateLabels();
  }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const fmt = (value) => Math.round(value * 100) / 100;
