/**
 * build-map.mjs ― 本物の日本地図（白地図）のデータを作る。
 *
 * ■ 元データ
 *   地球地図日本（国土地理院）の行政界を GeoJSON に変換したもの。
 *     https://github.com/dataofjapan/land  （japan.geojson）
 *   非営利利用は「出典元（地球地図日本）の明記」で使える。
 *   アプリの「せってい」画面と README に出典を書いてある。
 *
 * ■ この道具がすること
 *   13MB の GeoJSON を、教材に載せられる大きさの SVG パスに変換する。
 *     1. 緯度経度を平面に投影する
 *     2. こまかい island（小笠原・奄美など）を落とす
 *     3. 海岸線を簡略化する（Douglas–Peucker）
 *     4. 沖縄を別枠へ移動する
 *     5. 県名ラベルを置ける「県の内側の点」を求める
 *
 * ■ 使い方
 *     curl -sL -o tools/japan.geojson \
 *       https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson
 *     node tools/build-map.mjs
 *   → src/content/pref-paths.js が書き変わる
 *
 * ■ 精密さと軽さのつまみ
 *   SIMPLIFY_TOLERANCE を小さくすると海岸線がこまかくなり、ファイルが重くなる。
 *   小学生が位置関係をつかむのが目的なので、細かすぎても意味がない。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(HERE, "japan.geojson");
const OUTPUT = path.join(HERE, "..", "src", "content", "pref-paths.js");

/* --- 調整できる値 --------------------------------------------------------- */

/** 出力する地図の横幅（SVG のユーザー単位）。高さは形から決まる */
const VIEW_WIDTH = 1000;

/** 海岸線の簡略化の強さ。大きいほどカクカクになり、ファイルは軽くなる */
const SIMPLIFY_TOLERANCE = 0.9;

/** これより小さい島は描かない（本土に対する面積比） */
const MIN_ISLAND_RATIO = 0.004;
/** ただし、この面積を超える島は必ず残す（佐渡・淡路島・小豆島など） */
const KEEP_ISLAND_AREA = 6.0;

/** 本州側の地図に載せる範囲。ここから外れた島は落とす */
const MAIN_AREA = { minLat: 30.0, maxLat: 46.2, minLon: 128.3, maxLon: 149.0 };

/**
 * 沖縄を置く別枠（本土の範囲に対する割合で指定）。
 * 日本列島は左下（九州）から右上（北海道）へ斜めに伸びるので、
 * 右下は海しかない。教科書の白地図と同じくそこへ置く。
 */
const INSET = { left: 0.70, top: 0.66, width: 0.26 };

/* --- 投影 ----------------------------------------------------------------- */

// 日本のまん中あたりの緯度。ここで経度の縮みを補正すると形がゆがまない
const LAT_MID = 37.5;
const LON_SCALE = Math.cos((LAT_MID * Math.PI) / 180);

const project = ([lon, lat]) => [lon * LON_SCALE, -lat];

/* --- 幾何のたすけ --------------------------------------------------------- */

/** 多角形の面積（符号なし） */
function areaOf(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(sum / 2);
}

/** 点と線分の距離の2乗 */
function distanceToSegmentSquared(p, a, b) {
  let x = a[0], y = a[1];
  let dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p[0] - x; dy = p[1] - y;
  return dx * dx + dy * dy;
}

/**
 * Douglas–Peucker で線を簡略化する。
 * 「元の線からこれ以上離れない」範囲で点を減らすので、
 * 半島や湾のような特徴的な形は残りやすい。
 */
function simplify(points, tolerance) {
  if (points.length <= 3) return points;
  const toleranceSquared = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDistance = 0, index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegmentSquared(points[i], points[first], points[last]);
      if (d > maxDistance) { maxDistance = d; index = i; }
    }
    if (maxDistance > toleranceSquared && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** 点が多角形の内側にあるか */
function isInside(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > point[1]) !== (yj > point[1]) &&
        point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** 点から多角形の辺までの最短距離（内側なら正） */
function distanceToRing(point, ring) {
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    min = Math.min(min, distanceToSegmentSquared(point, ring[j], ring[i]));
  }
  return Math.sqrt(min);
}

/**
 * 県名を置くのに良い「県の内側の点」を探す。
 *
 * 重心をそのまま使うと、弓なりの県（京都・高知）では図形の外に出てしまう。
 * いちばん広い島の内側を格子状に調べ、
 * 「まわりの海岸線からいちばん遠い点」を選ぶ。
 */
function labelPointOf(ring) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }

  let best = [(minX + maxX) / 2, (minY + maxY) / 2];
  let bestDistance = -1;
  const steps = 24;

  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const point = [
        minX + ((maxX - minX) * i) / steps,
        minY + ((maxY - minY) * j) / steps,
      ];
      if (!isInside(point, ring)) continue;
      const distance = distanceToRing(point, ring);
      if (distance > bestDistance) { bestDistance = distance; best = point; }
    }
  }
  return { point: best, radius: Math.max(0, bestDistance) };
}

/* --- 変換 ----------------------------------------------------------------- */

if (!fs.existsSync(SOURCE)) {
  console.error(`元データがありません: ${SOURCE}`);
  console.error("次のコマンドで取得してください:");
  console.error("  curl -sL -o tools/japan.geojson \\");
  console.error("    https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson");
  process.exit(1);
}

const geojson = JSON.parse(fs.readFileSync(SOURCE, "utf8"));

/** 県ごとに、残す島の輪郭（投影ずみ）を集める */
const shapes = new Map();   // id -> { rings: [][], name }

for (const feature of geojson.features) {
  const id = feature.properties.id;
  const name = feature.properties.nam_ja;
  const isOkinawa = id === 47;

  // MultiPolygon / Polygon の両方を、外側の輪郭の配列にそろえる
  const polygons = feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;

  const rings = [];
  for (const polygon of polygons) {
    const outer = polygon[0];           // 穴（内側の輪）は使わない
    if (!outer || outer.length < 4) continue;

    // 本土の地図から外れる島を落とす（小笠原・奄美など）。
    // 沖縄は別枠に描くので、この判定から外す。
    if (!isOkinawa) {
      const sample = outer[0];
      if (sample[1] < MAIN_AREA.minLat || sample[1] > MAIN_AREA.maxLat ||
          sample[0] < MAIN_AREA.minLon || sample[0] > MAIN_AREA.maxLon) continue;
    }

    rings.push(outer.map(project));
  }
  if (rings.length === 0) continue;

  // 小さすぎる島を落とす。いちばん大きい島は必ず残す
  rings.sort((a, b) => areaOf(b) - areaOf(a));
  const largest = areaOf(rings[0]);
  const kept = rings.filter((ring, index) => {
    if (index === 0) return true;
    const area = areaOf(ring);
    return area >= KEEP_ISLAND_AREA || area / largest >= MIN_ISLAND_RATIO;
  });

  shapes.set(id, { name, rings: kept });
}

/* --- 沖縄を別枠へ移す ----------------------------------------------------- */

const boundsOfRings = (rings) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

// まず本土だけの範囲を出す（沖縄を入れると日本が縦に間のびする）
const mainRings = [...shapes.entries()]
  .filter(([id]) => id !== 47)
  .flatMap(([, shape]) => shape.rings);
const mainBounds = boundsOfRings(mainRings);

const okinawa = shapes.get(47);

// 沖縄県は与那国島から南大東島まで1000km近くに散らばっている。
// 全部を枠に収めると沖縄本島が点のようになり、指で押せない。
// 教科書の白地図と同じく、本島のまわりだけを大きく描く。
{
  const centroidOf = (ring) => {
    let x = 0, y = 0;
    for (const [px, py] of ring) { x += px; y += py; }
    return [x / ring.length, y / ring.length];
  };
  const main = [...okinawa.rings].sort((a, b) => areaOf(b) - areaOf(a))[0];
  const [mx, my] = centroidOf(main);
  const NEAR = 1.1;   // 本島からこの距離（投影後の単位）までを残す
  okinawa.rings = okinawa.rings.filter((ring) => {
    const [cx, cy] = centroidOf(ring);
    return Math.hypot(cx - mx, cy - my) <= NEAR;
  });
}

// 沖縄を別枠の中へ移す。本島がしっかり見える大きさまで拡大する
const okinawaBounds = boundsOfRings(okinawa.rings);
const insetWidth = mainBounds.width * INSET.width;
const okinawaScale = insetWidth / Math.max(okinawaBounds.width, okinawaBounds.height);
const insetX = mainBounds.minX + mainBounds.width * INSET.left;
const insetY = mainBounds.minY + mainBounds.height * INSET.top;

okinawa.rings = okinawa.rings.map((ring) => ring.map(([x, y]) => [
  insetX + (x - okinawaBounds.minX) * okinawaScale,
  insetY + (y - okinawaBounds.minY) * okinawaScale,
]));

// 枠は、実際に描いた沖縄をぐるりと囲む大きさにする
const okinawaDrawn = boundsOfRings(okinawa.rings);
const padding = insetWidth * 0.12;
const insetBox = {
  x: okinawaDrawn.minX - padding,
  y: okinawaDrawn.minY - padding,
  width: okinawaDrawn.width + padding * 2,
  height: okinawaDrawn.height + padding * 2,
};

/* --- 全体を viewBox に収める ---------------------------------------------- */

const allBounds = boundsOfRings([...shapes.values()].flatMap((s) => s.rings));
const scale = VIEW_WIDTH / allBounds.width;
const VIEW_HEIGHT = Math.round(allBounds.height * scale);

const toView = ([x, y]) => [
  (x - allBounds.minX) * scale,
  (y - allBounds.minY) * scale,
];

for (const shape of shapes.values()) {
  shape.rings = shape.rings.map((ring) => simplify(ring.map(toView), SIMPLIFY_TOLERANCE));
}
const insetBoxView = {
  x: round((insetBox.x - allBounds.minX) * scale),
  y: round((insetBox.y - allBounds.minY) * scale),
  width: round(insetBox.width * scale),
  height: round(insetBox.height * scale),
};

/* --- 出力 ----------------------------------------------------------------- */

function round(value) { return Math.round(value * 10) / 10; }

const paths = {};
const bounds = {};
const labels = {};

for (const [id, shape] of [...shapes.entries()].sort((a, b) => a[0] - b[0])) {
  paths[id] = shape.rings
    .map((ring) => "M" + ring.map(([x, y]) => `${round(x)} ${round(y)}`).join("L") + "Z")
    .join("");

  const b = boundsOfRings(shape.rings);
  bounds[id] = { x: round(b.minX), y: round(b.minY), width: round(b.width), height: round(b.height) };

  // ラベルはいちばん大きい島の内側に置く
  const largest = [...shape.rings].sort((a, c) => areaOf(c) - areaOf(a))[0];
  const { point, radius } = labelPointOf(largest);
  labels[id] = { x: round(point[0]), y: round(point[1]), r: round(radius) };
}

const lines = [];
lines.push(`/**
 * pref-paths.js ― 47都道府県の形（本物の白地図）。
 *
 * このファイルは手で書いたものではなく、tools/build-map.mjs が
 * 地球地図日本（国土地理院）の行政界データから生成している。
 * 直したいときはスクリプトの数値を変えて作り直すこと。
 *   node tools/build-map.mjs
 *
 * 出典: 地球地図日本（国土地理院）
 *   https://www.gsi.go.jp/kankyochiri/gm_jpn.html
 *   GeoJSON 変換版: https://github.com/dataofjapan/land
 *
 * ・PATHS        … SVG の d 属性そのもの（島ごとに M...Z を連結）
 * ・BOUNDS       … 県ごとの外接矩形。ズームに使う
 * ・LABEL_POINTS … 県名を置ける内側の点。r は海岸線までの距離で、
 *                  文字が収まるかの判断に使う
 * ・INSET_BOX    … 沖縄を描いている別枠。点線で囲って描く
 */`);
lines.push("");
lines.push(`export const VIEW_WIDTH = ${VIEW_WIDTH};`);
lines.push(`export const VIEW_HEIGHT = ${VIEW_HEIGHT};`);
lines.push(`export const INSET_BOX = ${JSON.stringify(insetBoxView)};`);
lines.push("");
lines.push("export const PATHS = {");
for (const [id, d] of Object.entries(paths)) {
  lines.push(`  ${id}: "${d}", // ${shapes.get(Number(id)).name}`);
}
lines.push("};");
lines.push("");
lines.push(`export const BOUNDS = ${JSON.stringify(bounds)};`);
lines.push("");
lines.push(`export const LABEL_POINTS = ${JSON.stringify(labels)};`);
lines.push("");
lines.push(`/** 出典表示。画面のどこかに必ず出すこと（利用条件） */
export const MAP_ATTRIBUTION = "地図データ：地球地図日本（国土地理院）";`);
lines.push("");

fs.writeFileSync(OUTPUT, lines.join("\n"), "utf8");

const size = fs.statSync(OUTPUT).size;
console.log(`書き出しました: ${path.relative(process.cwd(), OUTPUT)}`);
console.log(`  viewBox: 0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`);
console.log(`  ファイル: ${(size / 1024).toFixed(1)} KB`);
console.log(`  島の数: ${[...shapes.values()].reduce((n, s) => n + s.rings.length, 0)}`);
console.log(`  点の数: ${[...shapes.values()].reduce((n, s) => n + s.rings.reduce((m, r) => m + r.length, 0), 0)}`);
