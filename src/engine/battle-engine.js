/**
 * battle-engine.js ― 戦闘の進行。
 *
 * ■ 戦い方
 *   1問が1ターン。
 *     ○ … 強く攻撃する（すこし回復もする）
 *     △ … 弱く攻撃する
 *     × … 攻撃できず、敵の反撃を受ける
 *
 * ■ 負けても失うものは無い
 *   HPが0になっても経験値も記録も減らさず、全回復して同じ敵に挑み直す。
 *   ここでペナルティを課すと、間違えるのが怖くなって
 *   「わからない問題を飛ばす」ようになる。それは学習として最悪の状態。
 *   戦闘は「がんばりの見える化」であって、罰の道具ではない。
 *
 * ■ 進行
 *   ざこ2体 → 中ボス で1地方クリア。北から9地方をクリアすると魔王が出る。
 */

import { bus, Events } from "../core/event-bus.js";
import { Judge } from "./scoring-engine.js";
import { REGION_ORDER, REGION_BY_ID } from "../content/regions.js";
import { enemyAt, enemyCountOf, DEMON_LORD } from "../content/enemies.js";
import { random } from "../utils/random.js";

/** ○△× ごとの攻撃力の倍率 */
const DAMAGE_MULTIPLIER = {
  [Judge.MARU]: 1.0,
  [Judge.SANKAKU]: 0.55,
  [Judge.BATSU]: 0,
};

/** 正解したときに回復するHP。じわじわ削られて詰まないようにする保険 */
const HEAL_ON_CORRECT = 2;

/** 倒れたとき、敵のHPがどれだけ戻るか（軽いペナルティ） */
const ENEMY_RECOVERY_ON_DEFEAT = 0.3;

export class BattleEngine {
  #store;

  constructor(store) {
    this.#store = store;
    this.#ensureEnemy();
  }

  /* --- いまの状況 -------------------------------------------------------- */

  /** いま挑戦している地方 id。すべて制覇済みなら null（＝魔王） */
  get currentRegionId() {
    const cleared = this.#store.battle.clearedRegions;
    return REGION_ORDER.find((id) => !cleared.includes(id)) ?? null;
  }

  get currentRegion() {
    const id = this.currentRegionId;
    return id ? REGION_BY_ID.get(id) : null;
  }

  /** いま戦っている敵 */
  get enemy() {
    const battle = this.#store.battle;
    return enemyAt(battle.region, battle.enemyIndex);
  }

  /** 敵の残りHP */
  get enemyHp() {
    return this.#store.battle.enemyHp ?? this.enemy?.maxHp ?? 0;
  }

  /** 魔王を倒し終わったか */
  get isGameCleared() {
    return this.#store.battle.demonLordDefeated;
  }

  /** この地方の何体目か（画面表示用） */
  get regionProgress() {
    const battle = this.#store.battle;
    const total = battle.region ? enemyCountOf(battle.region) : 1;
    return { index: battle.enemyIndex, total };
  }

  /* --- 1ターン ----------------------------------------------------------- */

  /**
   * 答え合わせの結果を戦闘に反映する。
   * 状態の書き換えはここに閉じ込め、画面には「何が起きたか」だけを返す。
   *
   * @param {string} judge "maru" | "sankaku" | "batsu"
   * @returns {object} 演出に必要な情報
   */
  resolve(judge) {
    if (this.isGameCleared) return { skipped: true };

    this.#ensureEnemy();
    const enemy = this.enemy;
    if (!enemy) return { skipped: true };

    const player = this.#store.player;
    const outcome = {
      enemy,
      damage: 0,
      healed: 0,
      counterDamage: 0,
      enemyDefeated: false,
      playerDown: false,
      regionCleared: null,
      gameCleared: false,
      nextEnemy: null,
    };

    if (judge === Judge.BATSU) {
      // 攻撃できず反撃を受ける。守備力で軽減するが、
      // 軽減しすぎると後半で無傷になるので効き目は控えめにしている。
      const damage = Math.max(1, Math.round(enemy.atk - player.def * 0.25));
      outcome.counterDamage = damage;

      this.#store.update((save) => {
        save.player.hp = Math.max(0, save.player.hp - damage);
      });

      if (this.#store.player.hp <= 0) {
        outcome.playerDown = true;
        this.#recoverFromDefeat();
      }
      bus.emit(Events.PLAYER_DAMAGED,
        { enemy, damage, playerDown: outcome.playerDown });
      return outcome;
    }

    // --- 攻撃 ---
    const multiplier = DAMAGE_MULTIPLIER[judge] ?? 0;
    // ±12% のゆらぎを入れて、毎回同じ数字にならないようにする
    const variance = 0.88 + random() * 0.24;
    const damage = Math.max(1, Math.round(player.atk * multiplier * variance));
    outcome.damage = damage;

    const healed = judge === Judge.MARU
      ? Math.min(HEAL_ON_CORRECT, player.maxHp - player.hp)
      : 0;
    outcome.healed = healed;

    let remaining = 0;
    this.#store.update((save) => {
      save.battle.enemyHp = Math.max(0, (save.battle.enemyHp ?? enemy.maxHp) - damage);
      save.player.hp = Math.min(save.player.maxHp, save.player.hp + healed);
      remaining = save.battle.enemyHp;
    });

    bus.emit(Events.ENEMY_DAMAGED, { enemy, damage });

    if (remaining > 0) return outcome;

    // --- 撃破 ---
    outcome.enemyDefeated = true;
    bus.emit(Events.ENEMY_DEFEATED, { enemy });
    this.#advance(outcome);
    return outcome;
  }

  /* --- 進行 -------------------------------------------------------------- */

  /** 敵を倒したあとの進行（次の敵／地方制覇／魔王撃破） */
  #advance(outcome) {
    const battle = this.#store.battle;

    // 魔王を倒した
    if (battle.region === null) {
      this.#store.update((save) => {
        save.battle.demonLordDefeated = true;
        save.battle.enemyHp = 0;
      });
      outcome.gameCleared = true;
      bus.emit(Events.GAME_CLEARED);
      return;
    }

    const total = enemyCountOf(battle.region);
    const nextIndex = battle.enemyIndex + 1;

    if (nextIndex < total) {
      // 同じ地方の次の敵へ
      this.#store.update((save) => {
        save.battle.defeatedEnemies.push(outcome.enemy.id);
        save.battle.enemyIndex = nextIndex;
        save.battle.enemyHp = null;
      });
      this.#ensureEnemy();
      outcome.nextEnemy = this.enemy;
      return;
    }

    // 地方を制覇した
    const clearedRegionId = battle.region;
    this.#store.update((save) => {
      save.battle.defeatedEnemies.push(outcome.enemy.id);
      save.battle.clearedRegions.push(clearedRegionId);
      save.battle.region = null;      // 次の地方は #ensureEnemy が決める
      save.battle.enemyIndex = 0;
      save.battle.enemyHp = null;
      // 地方を制覇したごほうびに全回復
      save.player.hp = save.player.maxHp;
    });

    outcome.regionCleared = REGION_BY_ID.get(clearedRegionId) ?? null;
    bus.emit(Events.REGION_CLEARED, { region: outcome.regionCleared });

    this.#ensureEnemy();
    outcome.nextEnemy = this.enemy;
  }

  /**
   * 敵がいなければ用意する。
   * セーブデータの region が古い／壊れている場合もここで直す。
   */
  #ensureEnemy() {
    const battle = this.#store.battle;
    const expectedRegion = this.currentRegionId;

    const needsReset =
      battle.region !== expectedRegion ||
      battle.enemyHp === null ||
      battle.enemyHp === undefined ||
      !enemyAt(expectedRegion, battle.enemyIndex);

    if (!needsReset) return;
    if (this.isGameCleared) return;

    const index = enemyAt(expectedRegion, battle.enemyIndex) ? battle.enemyIndex : 0;
    const enemy = enemyAt(expectedRegion, index) ?? DEMON_LORD;

    this.#store.update((save) => {
      save.battle.region = expectedRegion;
      save.battle.enemyIndex = index;
      save.battle.enemyHp = enemy.maxHp;
    });

    bus.emit(Events.ENEMY_APPEARED, { enemy });
  }

  /** 倒れたときの立て直し。記録は一切減らさない */
  #recoverFromDefeat() {
    const enemy = this.enemy;
    this.#store.update((save) => {
      save.player.hp = save.player.maxHp;
      if (enemy) {
        const recovered = Math.round(enemy.maxHp * ENEMY_RECOVERY_ON_DEFEAT);
        save.battle.enemyHp = Math.min(enemy.maxHp, (save.battle.enemyHp ?? 0) + recovered);
      }
    });
  }
}

/** 制覇した地方の数（画面表示用） */
export function clearedRegionCount(store) {
  return store.battle.clearedRegions.length;
}
