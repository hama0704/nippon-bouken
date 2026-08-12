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

export class MapRenderer {
  /** @type {SVGSVGElement} */
  element;
  #paths = new Map();     // prefectureId -> <path>
  #labels = new Map();    // prefectureId -> <text>
  #viewport;              // ズーム・パン用の <g>
  #onSelect;
  #interactive;

  /**
   * @param {object} options
   * @param {(prefectureId:number) => void} [options.onSelect] 県をタップしたとき
   * @param {boolean} [options.interactive=true] false なら見るだけ（クイズの出題図など）
   * @param {boolean} [options.showLabels=true] 県名ラベルを出すか
   */
  constructor({ onSelect, interactive = true, showLabels = true } = {}) {
    this.#onSelect = onSelect;
    this.#interactive = interactive;
    this.element = this.#build(showLabels);
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
    const from = this.element.viewBox.baseVal;
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
      this.element.setAttribute("viewBox", `${to.x} ${to.y} ${to.w} ${to.h}`);
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
      this.element.setAttribute("viewBox", `${cx} ${cy} ${cw} ${ch}`);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** 県の <path> 要素を取り出す（演出で直接触りたいとき用） */
  pathOf(prefectureId) {
    return this.#paths.get(prefectureId) ?? null;
  }
}

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
