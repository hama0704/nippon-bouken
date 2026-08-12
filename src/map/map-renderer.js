/**
 * map-renderer.js ― 日本地図の SVG を組み立てて操作する。
 *
 * 外から見た使い方:
 *   const map = new MapRenderer({ onSelect: (id) => ... });
 *   container.appendChild(map.element);
 *   map.setState(13, "target");     // 東京を出題中の色にする
 *   map.focusOn(13);                // 東京へズーム
 *
 * 形状データ（pref-shapes.js）と描画をここで完全に分けているので、
 * 将来もっと精密な地図に差し替えるときも、直すのはこのファイルと
 * shape-builder.js だけで済む。
 */

import { el } from "../utils/dom.js";
import { PREFECTURES, fullName } from "../content/prefectures.js";
import { REGION_BY_ID } from "../content/regions.js";
import { GRID_COLS, GRID_ROWS, INSET_BOX, cellsOf } from "../content/pref-shapes.js";
import { cellsToPath, labelLayout, boundsOf } from "./shape-builder.js";

/** 1マスを何ユーザー単位で描くか。SVG は viewBox で拡縮するので絶対値に意味はない */
const CELL = 10;

/** 拡大の下限（viewBox の幅）。これ以上は寄れない */
const MIN_VIEW_WIDTH = CELL * 6;
/** 縮小の上限。日本全体より少し引いたところで止める */
const MAX_VIEW_WIDTH = GRID_COLS * CELL * 1.4;
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
  /** なぞって動かしている最中の指の情報 */
  #pointers = new Map();
  #dragged = false;

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
  }

  #build(showLabels) {
    const width  = GRID_COLS * CELL;
    const height = GRID_ROWS * CELL;

    this.#viewport = el("g", { class: "map-viewport" });

    // 沖縄の別枠（点線の囲み）
    this.#viewport.appendChild(
      el("rect", {
        class: "map-inset",
        x: (INSET_BOX.col - 1) * CELL,
        y: (INSET_BOX.row - 1) * CELL,
        width:  INSET_BOX.cols * CELL,
        height: INSET_BOX.rows * CELL,
        rx: 4,
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 1,
        "stroke-dasharray": "4 3",
        opacity: "0.5",
      })
    );

    for (const prefecture of PREFECTURES) {
      const cells = cellsOf(prefecture.id);
      if (cells.length === 0) continue;

      const region = REGION_BY_ID.get(prefecture.region);
      const path = el("path", {
        class: "pref",
        d: cellsToPath(cells, CELL),
        style: { "--pref-color": `var(${region?.colorVar ?? "--c-surface-2"})` },
        dataset: { prefId: prefecture.id, region: prefecture.region, state: "default" },
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

      if (showLabels) {
        // 県に収まる置き方が見つかったときだけラベルを出す。
        // 収まらないまま出すと、となりの県の上に名前が重なって読めなくなる。
        const layout = labelLayout(cells, prefecture.name.length, CELL);
        if (layout) {
          const label = buildLabel(prefecture.name, layout);
          this.#viewport.appendChild(label);
          this.#labels.set(prefecture.id, label);
        }
      }
    }

    return el("svg", {
      class: "map-view",
      viewBox: `0 0 ${width} ${height}`,
      preserveAspectRatio: "xMidYMid meet",
      role: "group",
      "aria-label": "日本地図",
    }, this.#viewport);
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
   * @param {number} [padding=3] まわりに残す余白（マス数）
   */
  focusOn(prefectureId, padding = 3) {
    const cells = cellsOf(prefectureId);
    if (cells.length === 0) return;
    const bounds = boundsOf(cells, CELL);
    const pad = padding * CELL;
    this.setViewBox(
      bounds.x - pad,
      bounds.y - pad,
      bounds.width + pad * 2,
      bounds.height + pad * 2
    );
  }

  /** 日本全体が見える状態に戻す */
  resetZoom() {
    this.setViewBox(0, 0, GRID_COLS * CELL, GRID_ROWS * CELL);
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
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** 県の <path> 要素を取り出す（演出で直接触りたいとき用） */
  pathOf(prefectureId) {
    return this.#paths.get(prefectureId) ?? null;
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
  }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const fmt = (value) => Math.round(value * 100) / 100;

/**
 * 県名のラベルを作る。
 * 縦書きのときは1文字ずつ <tspan> に分け、下へずらして積む
 * （SVG には縦書きの指定が実質使えないため、自前で積む必要がある）。
 */
function buildLabel(name, layout) {
  if (layout.orientation === "horizontal") {
    return el("text", { class: "pref-label", x: layout.x, y: layout.y }, name);
  }

  const chars = [...name];
  const lineHeight = 8;
  // 文字列全体の中心が layout.y に来るよう、先頭の位置を上へずらす
  const firstY = layout.y - ((chars.length - 1) * lineHeight) / 2;

  return el("text", { class: "pref-label", x: layout.x, y: firstY },
    chars.map((char, index) =>
      el("tspan", { x: layout.x, dy: index === 0 ? 0 : lineHeight }, char))
  );
}
