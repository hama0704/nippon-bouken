/**
 * shape-builder.js ― マスの集合から SVG のパス文字列を作る。
 *
 * pref-shapes.js が持っているのは「どのマスを占めるか」だけ。
 * 見た目の輪郭（角の丸い多角形）はここで自動生成する。
 * こうしておくと、地図の形を直したい人はマスを足し引きするだけでよく、
 * パスの座標を手で書き直す必要がない。
 *
 * 手順:
 *   1. 各マスの4辺のうち「となりにマスが無い辺」＝外周の辺を集める
 *   2. 辺を端点でつなげて閉じたループにする（穴があれば複数ループになる）
 *   3. ループの角を丸めながら SVG のパス文字列にする
 */

/** 角を丸める半径（マス1つ分を 1 とした長さ）。0 にすると角ばった地図になる */
const CORNER_RADIUS = 0.3;

/**
 * マス集合 → SVG パス文字列。
 * @param {Array<{col:number,row:number}>} cells
 * @param {number} cellSize 1マスを何ユーザー単位で描くか
 * @returns {string} `d` 属性に入れる文字列
 */
export function cellsToPath(cells, cellSize = 10) {
  const loops = traceOutlines(cells);
  return loops.map((loop) => loopToRoundedPath(loop, cellSize)).join(" ");
}

/**
 * ラベル（県名）をどこに、どの向きで置くかを決める。
 *
 * 単純な重心だと L 字型の県で図形の外に出てしまう。
 * また、東京や石川のように「細くて縦に長い」県に横書きすると
 * 名前が県からはみ出して、となりの県の上に重なってしまう。
 *
 * そこで、いちばん長くつながっている行と列を調べ、
 *   ・横に文字数ぶんの余裕があれば横書き
 *   ・無ければ縦に余裕があるか調べて縦書き
 *   ・どちらも足りなければラベルを出さない
 * という順に決める。日本の地図で細長い県が縦書きになっているのと同じ理屈。
 *
 * @param {Array<{col:number,row:number}>} cells
 * @param {number} nameLength ラベルの文字数
 * @param {number} cellSize
 * @returns {{x:number, y:number, orientation:"horizontal"|"vertical"}|null}
 */
export function labelLayout(cells, nameLength, cellSize = 10) {
  const horizontal = longestRun(cells, "row");
  if (horizontal && horizontal.length >= nameLength) {
    return {
      x: ((horizontal.start - 1) + horizontal.length / 2) * cellSize,
      y: (horizontal.line - 0.5) * cellSize,
      orientation: "horizontal",
    };
  }

  const vertical = longestRun(cells, "col");
  if (vertical && vertical.length >= nameLength) {
    return {
      x: (vertical.line - 0.5) * cellSize,
      y: ((vertical.start - 1) + vertical.length / 2) * cellSize,
      orientation: "vertical",
    };
  }

  return null;
}

/**
 * いちばん長くつながっている行（または列）を探す。
 * @param {"row"|"col"} along "row" なら横方向、"col" なら縦方向
 * @returns {{line:number, start:number, end:number, length:number}|null}
 */
function longestRun(cells, along) {
  const isRow = along === "row";
  const groups = new Map();

  for (const { col, row } of cells) {
    const line = isRow ? row : col;         // まとめる軸
    const value = isRow ? col : row;        // 並ぶ軸
    if (!groups.has(line)) groups.set(line, []);
    groups.get(line).push(value);
  }

  let best = null;
  for (const [line, values] of groups) {
    values.sort((a, b) => a - b);
    let start = values[0], previous = values[0];
    const flush = (end) => {
      const length = end - start + 1;
      if (!best || length > best.length) best = { line, start, end, length };
    };
    for (let i = 1; i < values.length; i++) {
      if (values[i] !== previous + 1) { flush(previous); start = values[i]; }
      previous = values[i];
    }
    flush(previous);
  }
  return best;
}

/** マス集合の外接矩形（ズームやヒットエリアの計算に使う） */
export function boundsOf(cells, cellSize = 10) {
  let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
  for (const { col, row } of cells) {
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
  }
  return {
    x: (minCol - 1) * cellSize,
    y: (minRow - 1) * cellSize,
    width:  (maxCol - minCol + 1) * cellSize,
    height: (maxRow - minRow + 1) * cellSize,
  };
}

/* ---------------------------------------------------------------------------
 * 内部: 外周のトレース
 * ------------------------------------------------------------------------- */

/**
 * 外周の辺を時計回りにつなげて、閉じた頂点ループの配列を返す。
 * 座標はマス単位（マス(1,1)の左上が (0,0)）。
 */
function traceOutlines(cells) {
  const occupied = new Set(cells.map(({ col, row }) => `${col},${row}`));
  const has = (col, row) => occupied.has(`${col},${row}`);

  // 始点 → その始点から出る辺（終点）の一覧
  const edges = new Map();
  const addEdge = (from, to) => {
    const key = pointKey(from);
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push(to);
  };

  for (const { col, row } of cells) {
    const x0 = col - 1, y0 = row - 1, x1 = col, y1 = row;
    // 時計回り（y は下向き）になるよう向きをそろえる。
    // この向きが揃っていないとループをたどれない。
    if (!has(col, row - 1)) addEdge({ x: x0, y: y0 }, { x: x1, y: y0 }); // 上
    if (!has(col + 1, row)) addEdge({ x: x1, y: y0 }, { x: x1, y: y1 }); // 右
    if (!has(col, row + 1)) addEdge({ x: x1, y: y1 }, { x: x0, y: y1 }); // 下
    if (!has(col - 1, row)) addEdge({ x: x0, y: y1 }, { x: x0, y: y0 }); // 左
  }

  const loops = [];
  while (edges.size > 0) {
    const startKey = edges.keys().next().value;
    const loop = [];
    let currentKey = startKey;

    // 安全弁: 辺の総数を超えて回ったら異常なので打ち切る
    let guard = 0;
    const limit = cells.length * 4 + 8;

    while (guard++ < limit) {
      const candidates = edges.get(currentKey);
      if (!candidates || candidates.length === 0) { edges.delete(currentKey); break; }

      const next = candidates.pop();
      if (candidates.length === 0) edges.delete(currentKey);

      loop.push(parsePoint(currentKey));
      currentKey = pointKey(next);
      if (currentKey === startKey) break;
    }

    if (loop.length >= 4) loops.push(simplifyCollinear(loop));
  }

  return loops;
}

/** 一直線に並んだ中間点を取り除く（角だけ残す） */
function simplifyCollinear(loop) {
  const out = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const previous = loop[(i - 1 + n) % n];
    const current = loop[i];
    const next = loop[(i + 1) % n];
    const isCollinear =
      (previous.x === current.x && current.x === next.x) ||
      (previous.y === current.y && current.y === next.y);
    if (!isCollinear) out.push(current);
  }
  return out.length >= 3 ? out : loop;
}

/**
 * 頂点ループ → 角を丸めた SVG パス。
 * 各角で「手前の辺の終わり近く」から「次の辺の始まり近く」へ
 * 二次ベジェ曲線でショートカットする。
 */
function loopToRoundedPath(loop, cellSize) {
  const n = loop.length;
  if (n < 3) return "";

  const points = loop.map((p) => ({ x: p.x * cellSize, y: p.y * cellSize }));
  const radius = CORNER_RADIUS * cellSize;
  const parts = [];

  for (let i = 0; i < n; i++) {
    const previous = points[(i - 1 + n) % n];
    const current = points[i];
    const next = points[(i + 1) % n];

    // 角に食い込ませる長さは、隣り合う辺の半分を超えないようにする
    const inLength  = distance(previous, current);
    const outLength = distance(current, next);
    const r = Math.min(radius, inLength / 2, outLength / 2);

    const entry = lerpPoint(current, previous, r / inLength);
    const exit  = lerpPoint(current, next,     r / outLength);

    if (i === 0) parts.push(`M ${fmt(entry.x)} ${fmt(entry.y)}`);
    else         parts.push(`L ${fmt(entry.x)} ${fmt(entry.y)}`);

    parts.push(`Q ${fmt(current.x)} ${fmt(current.y)} ${fmt(exit.x)} ${fmt(exit.y)}`);
  }

  parts.push("Z");
  return parts.join(" ");
}

/* --- 小さなユーティリティ ------------------------------------------------- */

const pointKey = (p) => `${p.x},${p.y}`;
const parsePoint = (key) => {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
};
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y) || 1;
const lerpPoint = (from, to, t) => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});
/** 小数を短くして SVG を軽くする */
const fmt = (value) => Math.round(value * 100) / 100;
