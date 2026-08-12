/**
 * dom.js ― フレームワークを使わずに DOM を組み立てるための最小ヘルパ。
 *
 * ライブラリを1つも足さない方針なので、React の JSX にあたる役割をここが担う。
 * 使い方:
 *   el("div", { class: "panel" }, el("h2", {}, "タイトル"))
 *   el("button", { class: "btn", onClick: () => ... }, "はじめる")
 */

/** SVG 要素は名前空間が違うので、この一覧に載っているタグだけ createElementNS する */
const SVG_TAGS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline",
  "polygon", "text", "tspan", "defs", "linearGradient", "radialGradient",
  "stop", "filter", "feGaussianBlur", "feOffset", "feMerge", "feMergeNode",
  "clipPath", "use", "title", "desc",
]);

/**
 * 要素を作る。
 * @param {string} tag              タグ名
 * @param {Object} [props]          属性。特別扱いするキーは下記コメント参照
 * @param {...(Node|string|null|false|Array)} children 子要素
 * @returns {Element}
 */
export function el(tag, props = {}, ...children) {
  const node = SVG_TAGS.has(tag)
    ? document.createElementNS("http://www.w3.org/2000/svg", tag)
    : document.createElement(tag);

  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;

    if (key === "class") {
      node.setAttribute("class", value);
    } else if (key === "style" && typeof value === "object") {
      Object.assign(node.style, value);
    } else if (key === "dataset" && typeof value === "object") {
      for (const [dk, dv] of Object.entries(value)) {
        if (dv != null) node.dataset[dk] = dv;
      }
    } else if (key === "html") {
      // 信頼できる自前の文字列だけに使う（外部入力は絶対に渡さない）
      node.innerHTML = value;
    } else if (key.startsWith("on") && typeof value === "function") {
      // onClick -> "click", onPointerDown -> "pointerdown"
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }

  appendChildren(node, children);
  return node;
}

/** children を平坦化しつつ追加する（配列・null・数値を許容） */
function appendChildren(node, children) {
  for (const child of children) {
    if (child == null || child === false || child === true) continue;
    if (Array.isArray(child)) {
      appendChildren(node, child);
    } else if (child instanceof Node) {
      node.appendChild(child);
    } else {
      node.appendChild(document.createTextNode(String(child)));
    }
  }
}

/** 子要素をすべて削除する */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** 中身を差し替える */
export function replace(node, ...children) {
  clear(node);
  appendChildren(node, children);
  return node;
}

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * ふりがな付きテキストを作る。
 * 「東京」＋「とうきょう」→ <ruby>東京<rt>とうきょう</rt></ruby>
 * 設定で OFF のときは CSS 側（rt { display:none }）で消えるので、
 * ここでは常に ruby を組み立ててよい。
 */
export function ruby(text, reading) {
  if (!reading) return document.createTextNode(text);
  return el("ruby", {}, text, el("rt", {}, reading));
}

/**
 * スクリーンリーダーへ読み上げを送る。
 * 判定結果など「目で見て分かること」を音でも伝えるために使う。
 */
export function announce(message) {
  const region = document.getElementById("sr-announcer");
  if (!region) return;
  // 同じ文字列を続けて入れても読まれないので、一度空にしてから入れる
  region.textContent = "";
  requestAnimationFrame(() => { region.textContent = message; });
}

/** requestAnimationFrame を Promise で待つ（アニメの合間に使う） */
export const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** 指定ミリ秒待つ */
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
