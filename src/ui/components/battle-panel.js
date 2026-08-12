/**
 * battle-panel.js ― 問題画面に出す戦闘の表示。
 *
 * 敵の絵とHP、こちらのHPをまとめて面倒を見る。
 * 「いま何と戦っていて、あと何回正解すれば倒せそうか」が
 * ひと目で分かることを最優先にしている。
 *
 * 演出は Web Animations API を使う。CSS のクラス付け外しより
 * 「終わるまで待つ」が書きやすく、連続で起きても取りこぼさない。
 */

import { el, replace, clear } from "../../utils/dom.js";
import { createEnemyArt } from "./enemy-art.js";

export class BattlePanel {
  /** @type {HTMLElement} */
  element;

  #artBox;
  #nameLabel;
  #enemyBar;
  #enemyFill;
  #enemyLabel;
  #playerFill;
  #playerLabel;
  #damagePop;
  #enemy = null;

  constructor() {
    this.#artBox = el("div", { class: "battle__art" });
    this.#nameLabel = el("div", { class: "battle__name" });
    this.#damagePop = el("div", { class: "battle__pop", "aria-hidden": "true" });

    this.#enemyFill = el("div", { class: "bar__fill" });
    this.#enemyLabel = el("span", { class: "bar__label" });
    this.#enemyBar = el("div", { class: "bar bar--enemy" }, this.#enemyFill, this.#enemyLabel);

    this.#playerFill = el("div", { class: "bar__fill" });
    this.#playerLabel = el("span", { class: "bar__label" });

    this.element = el("div", { class: "battle" },
      el("div", { class: "battle__stage" }, this.#artBox, this.#damagePop),
      el("div", { class: "battle__meters" },
        this.#nameLabel,
        this.#enemyBar,
        el("div", { class: "battle__player" },
          el("span", { class: "battle__player-name" }, "ゆうしゃ"),
          el("div", { class: "bar bar--hp" }, this.#playerFill, this.#playerLabel)
        )
      )
    );
  }

  /* --- 表示の更新 -------------------------------------------------------- */

  /** 敵を差し替える（新しい敵が出たとき） */
  showEnemy(enemy, hp, player) {
    this.#enemy = enemy;
    replace(this.#artBox, createEnemyArt(enemy, { size: 150 }));
    const rank = { boss: "（ボス）", final: "（まおう）" }[enemy.tier] ?? "";
    replace(this.#nameLabel, `${enemy.name}${rank}`);
    this.element.hidden = false;
    this.update(hp, player);

    // 出現アニメーション
    this.#artBox.animate(
      [
        { transform: "translateY(-24px) scale(0.7)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 420, easing: "cubic-bezier(0.34,1.56,0.64,1)" }
    );
  }

  /** HP バーを現在値に合わせる */
  update(enemyHp, player) {
    if (this.#enemy) {
      const ratio = Math.max(0, enemyHp / this.#enemy.maxHp);
      this.#enemyFill.style.width = `${ratio * 100}%`;
      replace(this.#enemyLabel, `${Math.max(0, enemyHp)} / ${this.#enemy.maxHp}`);
    }
    const hpRatio = Math.max(0, player.hp / player.maxHp);
    this.#playerFill.style.width = `${hpRatio * 100}%`;
    replace(this.#playerLabel, `HP ${player.hp} / ${player.maxHp}`);
    // 残りHPが3割を切ったら色を変える（色だけでなく数字も出ている）
    this.#playerFill.parentElement.classList.toggle("is-low", hpRatio <= 0.3);
  }

  /**
   * 魔王を倒したあとは戦う相手がいないので、戦闘表示ごと消す。
   * 倒した敵をHP0のまま置きっぱなしにしない。
   */
  hide() {
    this.element.hidden = true;
    this.#enemy = null;
  }

  /* --- 演出 -------------------------------------------------------------- */

  /** こちらの攻撃が当たった */
  async playAttack(damage) {
    this.#popup(`-${damage}`, "battle__pop--damage");
    await this.#shake(this.#artBox, 8);
  }

  /** 敵の反撃を受けた */
  async playCounter(damage) {
    this.#popup(`ダメージ -${damage}`, "battle__pop--counter");
    await this.#shake(this.element, 5);
  }

  /** 敵を倒した */
  async playDefeat() {
    await this.#artBox.animate(
      [
        { transform: "none", opacity: 1, filter: "none" },
        { transform: "scale(1.15) rotate(6deg)", opacity: 1, filter: "brightness(2.2)", offset: 0.3 },
        { transform: "scale(0.2) rotate(-20deg)", opacity: 0, filter: "brightness(3)" },
      ],
      { duration: 700, easing: "ease-in" }
    ).finished.catch(() => {});
    clear(this.#artBox);
  }

  #popup(text, className) {
    const pop = el("div", { class: `battle__pop-item ${className}` }, text);
    this.#damagePop.appendChild(pop);
    pop.animate(
      [
        { transform: "translateY(0) scale(0.7)", opacity: 0 },
        { transform: "translateY(-14px) scale(1.15)", opacity: 1, offset: 0.25 },
        { transform: "translateY(-52px) scale(1)", opacity: 0 },
      ],
      { duration: 1000, easing: "ease-out" }
    ).finished.catch(() => {}).finally(() => pop.remove());
  }

  async #shake(target, distance) {
    const frames = [0, -distance, distance, -distance * 0.6, distance * 0.4, 0]
      .map((x) => ({ transform: `translateX(${x}px)` }));
    await target.animate(frames, { duration: 320, easing: "ease-out" })
      .finished.catch(() => {});
  }
}
