/**
 * handwriting-pad.js ― マス目に手で書くための入力欄。
 *
 * ■ 設計の要点
 *   ・マス目にする …… 漢字ドリルと同じ形。1マス1文字に決まるので、
 *                      「どこからどこまでが1文字か」を機械が推測せずに済み、
 *                      認識精度が大きく上がる。
 *   ・Pointer Events に一本化 …… マウス・指・Apple Pencil を同じコードで扱う。
 *   ・手のひら誤爆の防止 …… ペンが一度でも使われたら、以降は指を無視する。
 *                            iPad に手をついて書く子はとても多い。
 *   ・座標はマス内の 0..1 で保存 …… 画面の大きさや向きが変わっても
 *                                    認識エンジンに渡すデータは変わらない。
 */

import { el } from "../../utils/dom.js";

/** 何マス表示するか。「かながわけん」「ほっかいどう」の6文字が入る */
export const DEFAULT_CELL_COUNT = 6;

export class HandwritingPad {
  /** @type {HTMLElement} 画面に入れる要素 */
  element;

  #canvas;
  #ctx;
  #cellCount;
  #penWidth;
  #onChange;

  /** 確定した線。{ cell, points: [{x,y,p}] } の配列（座標はキャンバスのpx） */
  #strokes = [];
  /** いま書いている途中の線 */
  #current = null;
  /** ペンが使われたか。true になったら指の入力を無視する */
  #penSeen = false;
  /** 描画のスケール（devicePixelRatio 対応） */
  #dpr = 1;
  #resizeObserver = null;

  /**
   * @param {object} options
   * @param {number} [options.cellCount] マスの数
   * @param {number} [options.penWidth]  線の太さ（CSS px 基準）
   * @param {() => void} [options.onChange] 書かれた内容が変わったとき
   */
  constructor({ cellCount = DEFAULT_CELL_COUNT, penWidth = 6, onChange } = {}) {
    this.#cellCount = cellCount;
    this.#penWidth = penWidth;
    this.#onChange = onChange;

    this.#canvas = el("canvas", {
      class: "pad__canvas",
      // 読み上げ環境では手書きが使えないため、代替手段があることを伝える
      role: "img",
      "aria-label": "手書きで答えを書くマス目。書けない場合は「ヒント」から答えを確認できます。",
    });

    this.element = el("div", { class: "pad" }, this.#canvas);

    this.#attachPointerHandlers();
    this.#observeResize();
  }

  /* --- 外から使う API ---------------------------------------------------- */

  /** マスの数を変える（かんじ／ひらがなの切り替えなどで使う） */
  setCellCount(count) {
    if (count === this.#cellCount) return;
    this.#cellCount = count;
    this.clear();
  }

  /** 線の太さを変える（設定画面から） */
  setPenWidth(width) {
    this.#penWidth = width;
    this.#redraw();
  }

  /** 何か書かれているか */
  get hasInk() {
    return this.#strokes.length > 0;
  }

  /** すべて消す */
  clear() {
    this.#strokes = [];
    this.#current = null;
    this.#redraw();
    this.#onChange?.();
  }

  /** 直前の一画だけ消す（子どもは「書き直す」より「一画もどす」を多用する） */
  undo() {
    this.#strokes.pop();
    this.#redraw();
    this.#onChange?.();
  }

  /**
   * 認識エンジンに渡す形にして取り出す。
   * マスごとにまとめ、座標はそのマスの中の 0..1 に直す。
   * @returns {import("../../platform/recognition/recognizer.js").CellInput[]}
   */
  toCellInputs() {
    const { cellWidth, height } = this.#metrics();
    const cells = Array.from({ length: this.#cellCount }, () => ({ strokes: [] }));

    for (const stroke of this.#strokes) {
      if (stroke.cell < 0 || stroke.cell >= this.#cellCount) continue;
      const originX = stroke.cell * cellWidth;
      cells[stroke.cell].strokes.push({
        points: stroke.points.map((point) => ({
          x: (point.x - originX) / cellWidth,
          y: point.y / height,
          p: point.p,
        })),
      });
    }
    return cells;
  }

  /**
   * いま書かれている内容を画像として取り出す。
   * 自己採点のときに「自分の字」と「お手本」を並べて見せるために使う。
   * 見比べる作業そのものが定着に効くので、これは飾りではなく学習の一部。
   * @returns {string} data URL
   */
  toImage() {
    return this.#canvas.toDataURL("image/png");
  }

  /** 書かれているマスの数（先頭から連続している範囲） */
  get writtenCellCount() {
    const used = new Set(this.#strokes.map((stroke) => stroke.cell));
    let count = 0;
    while (used.has(count)) count++;
    return count;
  }

  /** 画面から外すときに必ず呼ぶ */
  destroy() {
    this.#resizeObserver?.disconnect();
  }

  /* --- 入力の受け取り ---------------------------------------------------- */

  #attachPointerHandlers() {
    const canvas = this.#canvas;

    canvas.addEventListener("pointerdown", (event) => {
      if (!this.#shouldAccept(event)) return;
      event.preventDefault();
      // ポインタを掴んでおくと、マスの外へはみ出しても線が途切れない。
      // 対応していない環境では失敗するが、書けなくなるわけではないので無視する。
      try { canvas.setPointerCapture(event.pointerId); } catch { /* 続行 */ }

      const point = this.#toCanvasPoint(event);
      this.#current = {
        cell: this.#cellIndexAt(point.x),
        points: [point],
        pointerId: event.pointerId,
      };
      this.#redraw();
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!this.#current || event.pointerId !== this.#current.pointerId) return;
      event.preventDefault();

      // getCoalescedEvents で間引かれた点も拾う。
      // 速く書いたときに線がカクカクになるのを防ぐ。
      const events = event.getCoalescedEvents?.() ?? [event];
      for (const raw of events) this.#current.points.push(this.#toCanvasPoint(raw));
      this.#redraw();
    });

    const finish = (event) => {
      if (!this.#current || event.pointerId !== this.#current.pointerId) return;
      event.preventDefault();
      if (this.#current.points.length > 0) {
        this.#strokes.push({ cell: this.#current.cell, points: this.#current.points });
      }
      this.#current = null;
      this.#redraw();
      this.#onChange?.();
    };

    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);
    canvas.addEventListener("pointerleave", finish);

    // ── iOS の「長押しで選択・虫めがね」を止める ──────────────────────
    //
    // 書いているときに手のひらが画面につくと、iOS はそれを長押しと解釈して
    // 文字選択モードに入る。すると書いている線が pointercancel で切られ、
    // 字が途中で途切れてしまう（教室で実際に起きた）。
    //
    // Pointer Events の preventDefault だけでは iOS のこの動作は止まらない。
    // touchstart / touchmove を passive:false で受けて preventDefault するのが
    // 確実な止め方。canvas 上では既定の動作は何ひとつ要らないので全部止める。
    const swallow = (event) => event.preventDefault();
    canvas.addEventListener("touchstart", swallow, { passive: false });
    canvas.addEventListener("touchmove", swallow, { passive: false });
    canvas.addEventListener("touchend", swallow, { passive: false });
    canvas.addEventListener("contextmenu", swallow);
    // 選択が始まりかけたら取り消す（手のひらが枠の外へはみ出したとき用）
    canvas.addEventListener("selectstart", swallow);
  }

  /**
   * この入力を受け付けるか。
   * Apple Pencil が使われている場面では、手のひらや指のタッチを捨てる。
   */
  #shouldAccept(event) {
    if (event.pointerType === "pen") {
      this.#penSeen = true;
      return true;
    }
    if (event.pointerType === "touch" && this.#penSeen) return false;
    // マウスは常に受け付ける（PCでの動作確認・キーボード併用のため）
    return true;
  }

  /** イベントの座標をキャンバス内の px に直す */
  #toCanvasPoint(event) {
    const rect = this.#canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      // 筆圧非対応の入力では 0 が来るので既定値に寄せる
      p: event.pointerType === "pen" && event.pressure > 0 ? event.pressure : 0.5,
    };
  }

  #cellIndexAt(x) {
    const { cellWidth } = this.#metrics();
    return Math.max(0, Math.min(this.#cellCount - 1, Math.floor(x / cellWidth)));
  }

  #metrics() {
    const rect = this.#canvas.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    return { width, height, cellWidth: width / this.#cellCount };
  }

  /* --- 描画 -------------------------------------------------------------- */

  #observeResize() {
    // 画面の回転やキーボード表示で大きさが変わるたびに描き直す
    this.#resizeObserver = new ResizeObserver(() => this.#resizeCanvas());
    this.#resizeObserver.observe(this.element);
    queueMicrotask(() => this.#resizeCanvas());
  }

  #resizeCanvas() {
    const rect = this.#canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Retina でも線がぼやけないよう、実ピクセル数で持つ
    this.#dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.#canvas.width = Math.round(rect.width * this.#dpr);
    this.#canvas.height = Math.round(rect.height * this.#dpr);

    this.#ctx = this.#canvas.getContext("2d");
    this.#redraw();
  }

  #redraw() {
    const ctx = this.#ctx;
    if (!ctx) return;
    const { width, height, cellWidth } = this.#metrics();

    ctx.save();
    ctx.scale(this.#dpr, this.#dpr);
    ctx.clearRect(0, 0, width, height);

    this.#drawGrid(ctx, width, height, cellWidth);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#101828";
    for (const stroke of this.#strokes) this.#drawStroke(ctx, stroke);
    if (this.#current) this.#drawStroke(ctx, this.#current);

    ctx.restore();
  }

  /** マス目と、中心の十字ガイド（漢字ドリルと同じ） */
  #drawGrid(ctx, width, height, cellWidth) {
    ctx.fillStyle = "#fffdf7";
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < this.#cellCount; i++) {
      const x = i * cellWidth;

      // 中心の点線ガイド
      ctx.save();
      ctx.strokeStyle = "#d8d3c4";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(x + cellWidth / 2, 4);
      ctx.lineTo(x + cellWidth / 2, height - 4);
      ctx.moveTo(x + 4, height / 2);
      ctx.lineTo(x + cellWidth - 4, height / 2);
      ctx.stroke();
      ctx.restore();

      // マスの枠
      ctx.strokeStyle = "#b9b2a0";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, 1, cellWidth - 2, height - 2);
    }
  }

  #drawStroke(ctx, stroke) {
    const points = stroke.points;
    if (points.length === 0) return;

    if (points.length === 1) {
      ctx.beginPath();
      ctx.fillStyle = "#101828";
      ctx.arc(points[0].x, points[0].y, this.#penWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // 筆圧で太さを変えるため、線分ごとに引く。
    // Apple Pencil で書くと「とめ・はね」の強弱が出て、紙に近い感触になる。
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1];
      const to = points[i];
      ctx.beginPath();
      ctx.lineWidth = this.#penWidth * (0.6 + to.p * 0.8);
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }
}
