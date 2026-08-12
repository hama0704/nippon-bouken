/**
 * stroke-recognizer.js ― 既定の手書き文字認識エンジン。
 *
 * ■ しくみ（学習データも外部ライブラリも使わない）
 *   1. マスに書かれた線を 64×64 の白黒画像にする（位置と大きさをそろえる）
 *   2. 同じサイズで「お手本」の文字をフォントで描き、同じ画像にする
 *   3. 両方から同じ特徴量を取り出して、似ている度合い（コサイン類似度）を測る
 *   4. いちばん似ているお手本の文字を答えとする
 *
 * ■ なぜこれで実用になるのか
 *   答えの候補が47都道府県に限られているから。
 *   「あらゆる漢字の中から当てる」のは難しいが、
 *   「1マス目は40通りのどれか」まで絞れていれば、
 *   ざっくりした特徴量でも十分に選び分けられる。
 *
 * ■ 特徴量（128次元）
 *   ・8×8 のマスごとの「墨の量」        …… どこが濃いか（64次元）
 *   ・4方向×4×4マスの「線の向き」      …… 縦横斜めの構成（64次元）
 *   どちらも画像から計算するので、筆で書いた線とフォントの太い線を
 *   同じ土俵で比べられる。
 *
 * ■ 精度が足りないと感じたら
 *   下の THRESHOLDS を調整するか、TEMPLATE_FONTS にフォントを足す。
 *   それでも不足なら、別エンジンに差し替える（README.md 参照）。
 */

import { Recognizer, emptyResult } from "./recognizer.js";

/** 特徴量を計算する画像の一辺（px）。大きくしても精度はあまり上がらない */
const SIZE = 64;

/** 正規化後、文字が画像のどれくらいを占めるか（余白を残す） */
const FILL_RATIO = 0.82;

/**
 * お手本を描くフォント。
 * ゴシックと明朝の2種類を用意して、どちらかに似ていれば当たりとする。
 * （子どもの字は教科書体に近いので、明朝系のお手本が効くことが多い）
 */
const TEMPLATE_FONTS = [
  "'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', sans-serif",
  "'Hiragino Mincho ProN', 'Yu Mincho', 'MS Mincho', serif",
];

/**
 * 自己確認へ回すかどうかの判定に使うしきい値。
 * 実際の児童の字で調整することを前提にしている（docs/CUSTOMIZE.md）。
 */
const THRESHOLDS = {
  /** これ未満の類似度なら「そもそも読めていない」とみなす */
  minScore: 0.55,
  /** 1位がここまで似ていれば十分に読めたとみなす */
  goodScore: 0.90,
  /** 1位と2位の差がこれ以上あれば「迷っていない」とみなす */
  clearMargin: 0.06,
  /** 総合の自信度がこれ未満なら子どもに○△×を確認してもらう */
  confirmBelow: 0.60,
};

export class StrokeRecognizer extends Recognizer {
  static id = "stroke";
  static label = "内蔵の文字認識（おすすめ）";

  /** 文字 → フォントごとの特徴量ベクトル。一度作れば使い回す */
  #templateCache = new Map();
  /** お手本を描くための作業用キャンバス */
  #canvas = null;
  #ctx = null;

  async init() {
    // OffscreenCanvas があれば使う（メインスレッドの描画と干渉しない）
    if (typeof OffscreenCanvas !== "undefined") {
      this.#canvas = new OffscreenCanvas(SIZE, SIZE);
    } else {
      this.#canvas = document.createElement("canvas");
      this.#canvas.width = SIZE;
      this.#canvas.height = SIZE;
    }
    this.#ctx = this.#canvas.getContext("2d", { willReadFrequently: true });
    if (!this.#ctx) throw new Error("2D コンテキストを取得できませんでした");

    // フォントの読み込み待ち。終わる前にお手本を作ると別の字形になってしまう
    if (document.fonts?.ready) await document.fonts.ready;
  }

  /**
   * @param {import("./recognizer.js").RecognizeRequest} request
   * @returns {Promise<import("./recognizer.js").RecognitionResult>}
   */
  async recognize({ cells, candidates }) {
    // 何も書かれていないマスは無視し、書かれている範囲だけを見る
    const written = cells.filter((cell) => countPoints(cell) >= 2);
    if (written.length === 0 || candidates.length === 0) return emptyResult();

    // 1. 書かれた各マスの特徴量
    const cellFeatures = written.map((cell) => {
      const image = rasterizeStrokes(cell.strokes, SIZE);
      return image ? extractFeatures(image, SIZE) : null;
    });
    if (cellFeatures.every((f) => f === null)) return emptyResult();

    // 2. 候補ごとにスコアを出す
    return this.matchFeatures(cellFeatures, candidates);
  }

  /**
   * 特徴量の配列から候補を選ぶ。
   *
   * recognize() から画像化の工程を切り離してあるのは、
   * ここだけを取り出して「識別できる力」を測れるようにするため。
   * 手書きデータが無くても、フォントで描いた字を入力に見立てて
   * 回帰テストが書ける（tests/ 参照）。
   *
   * @param {(Float32Array|null)[]} cellFeatures マスごとの特徴量
   * @param {string[]} candidates
   */
  matchFeatures(cellFeatures, candidates) {
    const scored = [];
    for (const candidate of candidates) {
      const score = this.#scoreCandidate([...candidate], cellFeatures);
      if (score !== null) scored.push({ text: candidate, score });
    }
    if (scored.length === 0) return emptyResult();

    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    const second = scored[1];
    const confidence = computeConfidence(top.score, second?.score ?? 0);

    return {
      text: top.text,
      confidence,
      ranked: scored.slice(0, 5),
      needsConfirmation: confidence < THRESHOLDS.confirmBelow,
    };
  }

  /**
   * テスト用: 文字をフォントで描いて特徴量にする。
   * TEMPLATE_FONTS に無いフォントを渡せば「見たことのない字形」を作れるので、
   * 未知の筆跡に対する識別力をおおまかに測れる。
   */
  featuresFromGlyph(char, font) {
    const image = rasterizeGlyph(this.#ctx, char, font, SIZE);
    return image ? extractFeatures(image, SIZE) : null;
  }

  /**
   * 候補の文字列と、書かれたマスの特徴量を突き合わせてスコアを返す。
   * 文字数が合わない候補は、合っている範囲だけ比べて減点する。
   */
  #scoreCandidate(chars, cellFeatures) {
    const compareCount = Math.min(chars.length, cellFeatures.length);
    if (compareCount === 0) return null;

    let total = 0;
    for (let i = 0; i < compareCount; i++) {
      const feature = cellFeatures[i];
      if (!feature) return null;
      total += this.#bestCharScore(chars[i], feature);
    }
    const mean = total / compareCount;

    // 文字数のずれ1つにつき15%減点する。
    // 「神奈川」と書いたのに「奈良」が勝つ、といった事故を防ぐ。
    const lengthGap = Math.abs(chars.length - cellFeatures.length);
    return mean * Math.pow(0.85, lengthGap);
  }

  /** 1文字ぶん。複数フォントのお手本のうち、いちばん似ているものを採用する */
  #bestCharScore(char, feature) {
    let best = 0;
    for (const template of this.#templatesOf(char)) {
      const score = cosineSimilarity(feature, template);
      if (score > best) best = score;
    }
    return best;
  }

  /** お手本の特徴量を作る（初回のみ計算し、以降はキャッシュを返す） */
  #templatesOf(char) {
    const cached = this.#templateCache.get(char);
    if (cached) return cached;

    const templates = [];
    for (const font of TEMPLATE_FONTS) {
      const image = rasterizeGlyph(this.#ctx, char, font, SIZE);
      if (image) templates.push(extractFeatures(image, SIZE));
    }
    this.#templateCache.set(char, templates);
    return templates;
  }

  dispose() {
    this.#templateCache.clear();
    this.#canvas = null;
    this.#ctx = null;
  }
}

/* ===========================================================================
 * 画像化
 * ========================================================================= */

/** マス内の点の総数 */
function countPoints(cell) {
  return (cell.strokes ?? []).reduce((sum, stroke) => sum + stroke.points.length, 0);
}

/**
 * 手書きの線を、位置と大きさをそろえた濃淡画像にする。
 * 座標はマス内の 0..1 で渡ってくる前提。
 * @returns {Float32Array|null} 長さ size*size、0(白)〜1(黒)
 */
function rasterizeStrokes(strokes, size) {
  const points = strokes.flatMap((stroke) => stroke.points);
  if (points.length < 2) return null;

  // 書かれた範囲を求めて、画像の中央に大きく配置し直す。
  // マスのどこに書いても、大きく書いても小さく書いても同じ結果にするため。
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  const spanX = Math.max(maxX - minX, 1e-4);
  const spanY = Math.max(maxY - minY, 1e-4);

  // 縦横の比率は保つ（「一」を正方形に引き伸ばさない）
  const scale = (size * FILL_RATIO) / Math.max(spanX, spanY);
  const offsetX = (size - spanX * scale) / 2 - minX * scale;
  const offsetY = (size - spanY * scale) / 2 - minY * scale;

  const buffer = new Float32Array(size * size);
  const penWidth = Math.max(2.5, size * 0.07);

  for (const stroke of strokes) {
    const pts = stroke.points;
    if (pts.length === 1) {
      // 点だけの画（「、」など）も潰さずに残す
      drawDisc(buffer, size,
        pts[0].x * scale + offsetX, pts[0].y * scale + offsetY, penWidth / 2);
      continue;
    }
    for (let i = 1; i < pts.length; i++) {
      drawSegment(buffer, size,
        pts[i - 1].x * scale + offsetX, pts[i - 1].y * scale + offsetY,
        pts[i].x * scale + offsetX, pts[i].y * scale + offsetY,
        penWidth);
    }
  }

  return blur3x3(buffer, size);
}

/**
 * お手本の文字をフォントで描いて、同じ形式の濃淡画像にする。
 * 一度大きめに描いてから、実際に墨が乗った範囲を測り直して中央に配置する
 * （フォントによって字の余白が違うため、2段階にしないとそろわない）。
 */
function rasterizeGlyph(ctx, char, font, size) {
  // --- 1回目: 大きさと位置を測るために描く ---
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(size * 0.7)}px ${font}`;
  ctx.fillText(char, size / 2, size / 2);
  ctx.restore();

  const first = toInkBuffer(ctx, size);
  const bounds = inkBounds(first, size);
  if (!bounds) return null;

  // --- 2回目: 測った範囲が FILL_RATIO を占めるように描き直す ---
  const spanX = bounds.maxX - bounds.minX + 1;
  const spanY = bounds.maxY - bounds.minY + 1;
  const scale = (size * FILL_RATIO) / Math.max(spanX, spanY);
  const centerX = (bounds.minX + bounds.maxX + 1) / 2;
  const centerY = (bounds.minY + bounds.maxY + 1) / 2;

  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.scale(scale, scale);
  ctx.translate(-centerX, -centerY);
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(size * 0.7)}px ${font}`;
  ctx.fillText(char, size / 2, size / 2);
  ctx.restore();

  return blur3x3(toInkBuffer(ctx, size), size);
}

/** キャンバスの中身を 0(白)〜1(黒) の配列にする */
function toInkBuffer(ctx, size) {
  const { data } = ctx.getImageData(0, 0, size, size);
  const buffer = new Float32Array(size * size);
  for (let i = 0, p = 0; i < buffer.length; i++, p += 4) {
    // 白背景に黒文字なので、明るさの逆が墨の濃さになる
    const luminance = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255;
    buffer[i] = 1 - luminance;
  }
  return buffer;
}

/** 墨が乗っている範囲を求める */
function inkBounds(buffer, size) {
  let minX = size, maxX = -1, minY = size, maxY = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (buffer[y * size + x] > 0.35) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, maxX, minY, maxY };
}

/* --- 線を引く（Canvas を使わず自前で描く。OffscreenCanvas 非対応環境でも動く） --- */

function drawSegment(buffer, size, x0, y0, x1, y1, width) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    drawDisc(buffer, size, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2);
  }
}

/** 半径 r の円を、ふちをぼかしながら塗る */
function drawDisc(buffer, size, cx, cy, r) {
  const minX = Math.max(0, Math.floor(cx - r - 1));
  const maxX = Math.min(size - 1, Math.ceil(cx + r + 1));
  const minY = Math.max(0, Math.floor(cy - r - 1));
  const maxY = Math.min(size - 1, Math.ceil(cy + r + 1));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      // 中心は 1、ふち(r)で 0 になるようになだらかに落とす
      const value = Math.min(1, Math.max(0, (r + 0.5 - distance)));
      if (value > 0) {
        const index = y * size + x;
        if (value > buffer[index]) buffer[index] = value;
      }
    }
  }
}

/** 3×3 の平均でぼかす。書く位置の少しのズレを吸収する */
function blur3x3(buffer, size) {
  const out = new Float32Array(buffer.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          sum += buffer[ny * size + nx];
          count++;
        }
      }
      out[y * size + x] = sum / count;
    }
  }
  return out;
}

/* ===========================================================================
 * 特徴量
 * ========================================================================= */

/**
 * 濃淡画像 → 128次元の特徴ベクトル（長さ1に正規化済み）。
 *   前半64次元: 8×8マスごとの墨の量
 *   後半64次元: 4方向 × 4×4マスの線の向き
 */
function extractFeatures(image, size) {
  const density = densityGrid(image, size, 8);   // 64
  const direction = directionGrid(image, size, 4); // 64

  // それぞれを単独で正規化してから並べる。
  // こうすると「濃さ」と「向き」が同じ重みで効く。
  normalizeInPlace(density);
  normalizeInPlace(direction);

  const feature = new Float32Array(density.length + direction.length);
  feature.set(density, 0);
  feature.set(direction, density.length);
  normalizeInPlace(feature);
  return feature;
}

/** grid×grid のマスごとの平均濃度 */
function densityGrid(image, size, grid) {
  const out = new Float32Array(grid * grid);
  const step = size / grid;
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      let sum = 0;
      const x0 = Math.floor(gx * step), x1 = Math.floor((gx + 1) * step);
      const y0 = Math.floor(gy * step), y1 = Math.floor((gy + 1) * step);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) sum += image[y * size + x];
      }
      out[gy * grid + gx] = sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/**
 * 線の向きの分布。
 * 画像の傾き（勾配）を求め、向きを4方向（横・斜め・縦・逆斜め）に分けて
 * grid×grid のマスごとに集計する。漢字の「横棒が多い／縦棒が多い」を捉える。
 */
function directionGrid(image, size, grid) {
  const bins = 4;
  const out = new Float32Array(grid * grid * bins);
  const step = size / grid;

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      // Sobel フィルタ
      const gx =
        -image[(y - 1) * size + (x - 1)] + image[(y - 1) * size + (x + 1)]
        - 2 * image[y * size + (x - 1)] + 2 * image[y * size + (x + 1)]
        - image[(y + 1) * size + (x - 1)] + image[(y + 1) * size + (x + 1)];
      const gy =
        -image[(y - 1) * size + (x - 1)] - 2 * image[(y - 1) * size + x] - image[(y - 1) * size + (x + 1)]
        + image[(y + 1) * size + (x - 1)] + 2 * image[(y + 1) * size + x] + image[(y + 1) * size + (x + 1)];

      const magnitude = Math.hypot(gx, gy);
      if (magnitude < 0.08) continue;

      // 向きは 180 度の範囲でよい（線に上下の区別はない）
      let angle = Math.atan2(gy, gx);
      if (angle < 0) angle += Math.PI;
      const bin = Math.min(bins - 1, Math.floor((angle / Math.PI) * bins));

      const cellX = Math.min(grid - 1, Math.floor(x / step));
      const cellY = Math.min(grid - 1, Math.floor(y / step));
      out[(cellY * grid + cellX) * bins + bin] += magnitude;
    }
  }
  return out;
}

/** ベクトルの長さを1にそろえる（コサイン類似度のため） */
function normalizeInPlace(vector) {
  let sumSquares = 0;
  for (let i = 0; i < vector.length; i++) sumSquares += vector[i] * vector[i];
  const norm = Math.sqrt(sumSquares);
  if (norm < 1e-8) return;
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;
}

/** コサイン類似度。両方とも長さ1なので内積そのもの */
function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/* ===========================================================================
 * 自信度
 * ========================================================================= */

/**
 * 「読めた」と言い切ってよいかを 0..1 で表す。
 *
 * ・1位の類似度が高いこと（そもそも似ている）
 * ・2位との差が開いていること（迷っていない）
 * の両方が必要。どちらかが欠けたら自己確認に回す。
 * こうしないと、似た漢字どうしで自信満々に誤答することになる。
 */
function computeConfidence(topScore, secondScore) {
  const { minScore, goodScore, clearMargin } = THRESHOLDS;

  const absolute = clamp01((topScore - minScore) / (goodScore - minScore));
  const separation = clamp01((topScore - secondScore) / clearMargin);
  return absolute * separation;
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));
