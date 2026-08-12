/**
 * random.js ― 乱数まわり。
 *
 * シードを指定できるようにしてあるのは、
 *   ・テストで「毎回同じ順番」を再現したい
 *   ・将来「クラス全員に同じ問題を出す」機能を作りたい
 * の2つのため。既定では普通のランダム。
 */

/** 既定の乱数源。setSeed を呼ぶと差し替わる */
let source = Math.random;

/**
 * 乱数のたねを固定する。
 * mulberry32 という小さくて質のよいアルゴリズムを使っている。
 * @param {number|null} seed null を渡すと通常のランダムに戻る
 */
export function setSeed(seed) {
  if (seed === null || seed === undefined) {
    source = Math.random;
    return;
  }
  let state = seed >>> 0;
  source = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0以上1未満の乱数 */
export const random = () => source();

/** min以上max以下の整数 */
export function randomInt(min, max) {
  return Math.floor(source() * (max - min + 1)) + min;
}

/** 配列から1つ選ぶ */
export function pick(items) {
  return items[Math.floor(source() * items.length)];
}

/**
 * 重みつきで1つ選ぶ。
 * @param {Array} items
 * @param {number[]} weights items と同じ長さ。0以上
 */
export function pickWeighted(items, weights) {
  let total = 0;
  for (const weight of weights) total += Math.max(0, weight);
  if (total <= 0) return pick(items);

  let threshold = source() * total;
  for (let i = 0; i < items.length; i++) {
    threshold -= Math.max(0, weights[i]);
    if (threshold <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** 配列を混ぜた新しい配列を返す（Fisher–Yates） */
export function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(source() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
