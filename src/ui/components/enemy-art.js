/**
 * enemy-art.js ― 敵の絵。すべてインラインSVGで描く。
 *
 * ■ なぜ画像ファイルにしないのか
 *   ・絵文字は OS によって見た目が変わり、意図した怖さ・かわいさが崩れる
 *   ・PNG を並べると配信サイズが増え、オフライン配布が重くなる
 *   ・SVG なら拡大しても綺麗で、色を CSS 変数から受け取れる
 *
 * ■ 新しい敵の絵を足すには
 *   下の ART に関数を1つ足すだけ。名前を enemies.js の art に書けば使われる。
 *   （手順は docs/ADD-ENEMY.md）
 *
 * 各関数は 0 0 100 100 の座標系で描く。呼び出し側が大きさを決める。
 */

import { el } from "../../utils/dom.js";

/* --- 描画のたすけ --------------------------------------------------------- */

const path = (d, fill, extra = {}) => el("path", { d, fill, ...extra });
const circle = (cx, cy, r, fill, extra = {}) => el("circle", { cx, cy, r, fill, ...extra });
const ellipse = (cx, cy, rx, ry, fill, extra = {}) =>
  el("ellipse", { cx, cy, rx, ry, fill, ...extra });

/** まるい目。どの敵にも付けると、こわすぎずに統一感が出る */
function eyes(cx, cy, spread = 12, r = 6, color = "#1b2030") {
  return el("g", {},
    circle(cx - spread, cy, r, "#fff"),
    circle(cx + spread, cy, r, "#fff"),
    circle(cx - spread + 1, cy + 1, r * 0.5, color),
    circle(cx + spread + 1, cy + 1, r * 0.5, color)
  );
}

/** おこった眉。ボスにだけ付けて格の違いを出す */
function angryBrows(cx, cy, spread = 12, color = "#1b2030") {
  return el("g", { stroke: color, "stroke-width": 3.5, "stroke-linecap": "round" },
    el("line", { x1: cx - spread - 7, y1: cy - 7, x2: cx - spread + 4, y2: cy - 2 }),
    el("line", { x1: cx + spread + 7, y1: cy - 7, x2: cx + spread - 4, y2: cy - 2 })
  );
}

/* --- 敵ごとの絵 ----------------------------------------------------------- */

const ART = {
  /** 北海道: 雪モンスター */
  snow: (c) => el("g", {},
    path("M50 8 L56 20 L68 18 L60 28 L72 34 L58 36 L50 48 L42 36 L28 34 L40 28 L32 18 L44 20 Z", "#dbeafe"),
    ellipse(50, 64, 30, 28, c.body),
    ellipse(50, 64, 30, 28, "none", { stroke: "#fff", "stroke-width": 2, opacity: 0.6 }),
    circle(34, 70, 5, "#93c5fd", { opacity: 0.8 }),
    circle(66, 70, 5, "#93c5fd", { opacity: 0.8 }),
    eyes(50, 58),
    path("M42 76 Q50 84 58 76", "none", { stroke: "#1b2030", "stroke-width": 3, "stroke-linecap": "round" })
  ),

  /** 東北: 鬼 */
  oni: (c) => el("g", {},
    path("M28 30 Q24 12 34 8 Q36 20 42 26 Z", "#fde68a"),
    path("M72 30 Q76 12 66 8 Q64 20 58 26 Z", "#fde68a"),
    ellipse(50, 60, 30, 30, c.body),
    path("M22 74 Q50 84 78 74 L78 88 Q50 96 22 88 Z", "#facc15"),
    path("M30 78 L38 86 M46 76 L54 86 M62 78 L70 86", "none",
      { stroke: "#a16207", "stroke-width": 3 }),
    eyes(50, 54, 13, 7),
    path("M40 68 Q50 78 60 68", "#7f1d1d"),
    path("M43 70 L45 76 L47 70 Z", "#fff"),
    path("M53 70 L55 76 L57 70 Z", "#fff")
  ),

  /** 関東: 機械兵 */
  machine: (c) => el("g", {},
    el("line", { x1: 50, y1: 6, x2: 50, y2: 22, stroke: "#94a3b8", "stroke-width": 3 }),
    circle(50, 8, 5, "#f87171"),
    el("rect", { x: 22, y: 24, width: 56, height: 46, rx: 10, fill: c.body }),
    el("rect", { x: 30, y: 34, width: 40, height: 16, rx: 8, fill: "#0f172a" }),
    el("rect", { x: 36, y: 39, width: 28, height: 6, rx: 3, fill: "#38bdf8" }),
    el("rect", { x: 34, y: 58, width: 32, height: 6, rx: 3, fill: "#0f172a" }),
    el("rect", { x: 14, y: 72, width: 72, height: 20, rx: 8, fill: "#64748b" }),
    circle(26, 82, 5, "#334155"),
    circle(74, 82, 5, "#334155"),
    circle(50, 82, 6, "#fbbf24")
  ),

  /** 中部: ドラゴン */
  dragon: (c) => el("g", {},
    path("M18 44 Q4 30 8 58 Q16 60 22 54 Z", "#a7f3d0"),
    path("M82 44 Q96 30 92 58 Q84 60 78 54 Z", "#a7f3d0"),
    ellipse(50, 60, 28, 28, c.body),
    path("M34 34 L38 22 L44 34 Z", "#f0fdf4"),
    path("M66 34 L62 22 L56 34 Z", "#f0fdf4"),
    ellipse(50, 74, 16, 12, "#d9f99d"),
    circle(45, 74, 2.5, "#365314"),
    circle(55, 74, 2.5, "#365314"),
    eyes(50, 54, 12, 6.5),
    path("M40 82 Q50 88 60 82", "none",
      { stroke: "#365314", "stroke-width": 2.5, "stroke-linecap": "round" })
  ),

  /** 近畿: 忍者 */
  ninja: (c) => el("g", {},
    ellipse(50, 58, 28, 30, c.body),
    path("M22 50 Q50 40 78 50 L78 60 Q50 52 22 60 Z", "#1e293b"),
    el("rect", { x: 24, y: 52, width: 52, height: 12, rx: 6, fill: "#f8fafc", opacity: 0.95 }),
    circle(40, 58, 4, "#0f172a"),
    circle(60, 58, 4, "#0f172a"),
    path("M74 46 Q92 40 96 52", "none", { stroke: "#1e293b", "stroke-width": 5, "stroke-linecap": "round" }),
    path("M50 78 L44 92 L56 92 Z", "#94a3b8"),
    circle(50, 84, 3, "#0f172a")
  ),

  /** 中国: 妖怪（からかさ小僧ふう） */
  youkai: (c) => el("g", {},
    path("M50 14 Q14 44 20 50 Q50 40 80 50 Q86 44 50 14 Z", c.body),
    path("M50 14 L50 50 M32 30 L38 48 M68 30 L62 48", "none",
      { stroke: "#4c1d95", "stroke-width": 2, opacity: 0.6 }),
    el("rect", { x: 47, y: 48, width: 6, height: 30, rx: 3, fill: "#78350f" }),
    circle(50, 60, 11, "#fff"),
    circle(50, 61, 6, "#1b2030"),
    path("M46 74 Q50 90 54 74", "#ef4444"),
    path("M34 82 Q28 92 38 94", "none", { stroke: "#78350f", "stroke-width": 4, "stroke-linecap": "round" })
  ),

  /** 四国: 精霊 */
  spirit: (c) => el("g", {},
    circle(50, 56, 30, c.body, { opacity: 0.55 }),
    circle(50, 56, 22, c.body, { opacity: 0.8 }),
    path("M50 20 Q62 30 50 40 Q38 30 50 20 Z", "#bbf7d0"),
    eyes(50, 54, 10, 5.5),
    path("M44 66 Q50 72 56 66", "none",
      { stroke: "#1b2030", "stroke-width": 2.5, "stroke-linecap": "round" }),
    circle(22, 40, 4, "#fef08a", { opacity: 0.9 }),
    circle(80, 46, 3, "#fef08a", { opacity: 0.9 }),
    circle(72, 24, 2.5, "#fef08a", { opacity: 0.9 })
  ),

  /** 九州: 火山モンスター */
  volcano: (c) => el("g", {},
    path("M50 10 Q56 22 50 30 Q44 22 50 10 Z", "#fca5a5"),
    path("M18 88 L34 34 Q50 20 66 34 L82 88 Z", "#57534e"),
    path("M34 34 Q50 24 66 34 Q58 44 50 40 Q42 44 34 34 Z", "#f97316"),
    path("M40 50 L46 66 L38 70 M62 48 L56 64 L64 70", "none",
      { stroke: "#f97316", "stroke-width": 4, "stroke-linecap": "round" }),
    ellipse(50, 74, 26, 16, c.body, { opacity: 0.35 }),
    eyes(50, 66, 13, 7),
    path("M40 82 Q50 76 60 82", "none",
      { stroke: "#fed7aa", "stroke-width": 3, "stroke-linecap": "round" })
  ),

  /** 沖縄: 海の魔物 */
  sea: (c) => el("g", {},
    ellipse(50, 48, 28, 26, c.body),
    path("M26 66 Q22 88 14 92 M38 70 Q34 90 28 94 M50 72 Q50 92 50 94 " +
         "M62 70 Q66 90 72 94 M74 66 Q78 88 86 92", "none",
      { stroke: c.body, "stroke-width": 7, "stroke-linecap": "round" }),
    path("M50 16 Q40 24 50 30 Q60 24 50 16 Z", "#fde68a"),
    eyes(50, 46, 12, 7),
    path("M42 60 Q50 66 58 60", "none",
      { stroke: "#0e7490", "stroke-width": 3, "stroke-linecap": "round" }),
    circle(30, 38, 4, "#fff", { opacity: 0.5 })
  ),

  /** ラスボス: 魔王 */
  demon: (c) => el("g", {},
    path("M24 26 Q12 4 30 6 Q30 18 38 24 Z", "#7f1d1d"),
    path("M76 26 Q88 4 70 6 Q70 18 62 24 Z", "#7f1d1d"),
    path("M34 20 L42 4 L50 18 L58 4 L66 20 Z", "#fbbf24"),
    ellipse(50, 56, 34, 32, c.body),
    path("M16 76 Q50 92 84 76 L84 94 Q50 100 16 94 Z", "#450a0a"),
    angryBrows(50, 46, 14),
    circle(36, 54, 8, "#fca5a5"),
    circle(64, 54, 8, "#fca5a5"),
    circle(36, 54, 4, "#7f1d1d"),
    circle(64, 54, 4, "#7f1d1d"),
    path("M36 70 Q50 82 64 70 Z", "#450a0a"),
    path("M40 71 L43 79 L46 71 Z", "#fff"),
    path("M54 71 L57 79 L60 71 Z", "#fff")
  ),
};

/**
 * 敵の絵を作る。
 * @param {object} enemy    enemies.js の敵データ
 * @param {object} [options]
 * @param {number} [options.size=180] 表示サイズ(px)
 * @returns {SVGElement}
 */
export function createEnemyArt(enemy, { size = 180 } = {}) {
  const draw = ART[enemy.art] ?? ART.snow;
  const colors = { body: `var(${enemy.colorVar})` };

  const svg = el("svg", {
    class: `enemy-art enemy-art--${enemy.tier}`,
    viewBox: "0 0 100 100",
    width: size,
    height: size,
    role: "img",
    "aria-label": `てき: ${enemy.name}`,
  }, draw(colors));

  // ボスには威圧感を足す（中身の絵は使い回しつつ格の違いを出す）
  if (enemy.tier !== "normal") {
    svg.appendChild(el("g", { opacity: 0.9 },
      path("M50 4 L54 14 L64 12 L58 20 L42 20 L36 12 L46 14 Z", "#fbbf24")
    ));
  }
  return svg;
}

/** 用意されている絵の一覧（設定画面やドキュメント用） */
export const ART_NAMES = Object.keys(ART);
