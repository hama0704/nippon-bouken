/**
 * event-bus.js ― 画面（ui/）とゲームロジック（engine/）を切り離すための pub/sub。
 *
 * なぜ必要か:
 *   画面が engine を直接呼び、engine が画面を直接書き換えると、教材を差し替えた
 *   ときに両方を直す羽目になる。イベント名だけを契約にしておけば、
 *   「問題に正解した」という事実に対して、効果音・経験値・アニメが
 *   それぞれ独立に反応できる。
 */

export class EventBus {
  #listeners = new Map();   // event 名 -> Set<handler>

  /**
   * 購読する。
   * @returns {() => void} 購読を解除する関数（画面破棄時に必ず呼ぶこと）
   */
  on(event, handler) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /** 1回だけ購読する */
  once(event, handler) {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off(event, handler) {
    this.#listeners.get(event)?.delete(handler);
  }

  /**
   * 発行する。
   * ひとつのハンドラが例外を投げても他のハンドラを止めないよう握りつぶす
   * （効果音の失敗で経験値加算が止まる、といった事故を防ぐ）。
   */
  emit(event, payload) {
    const handlers = this.#listeners.get(event);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[EventBus] "${event}" のハンドラで例外:`, error);
      }
    }
  }

  /** すべての購読を破棄する（テスト用） */
  clear() {
    this.#listeners.clear();
  }
}

/**
 * アプリ全体で使うイベント名の一覧。
 * 文字列を直接書くとタイプミスに気づけないので、必ずここ経由で参照する。
 */
export const Events = Object.freeze({
  // --- 画面遷移 ---
  SCREEN_CHANGED:  "screen:changed",

  // --- 出題サイクル ---
  QUESTION_STARTED: "question:started",   // { question }
  ANSWER_SUBMITTED: "answer:submitted",   // { question, input }
  ANSWER_JUDGED:    "answer:judged",      // { question, judgement }
  HINT_USED:        "hint:used",          // { level }

  // --- 成長 ---
  EXP_GAINED:      "player:expGained",    // { amount, reasons[] }
  LEVEL_UP:        "player:levelUp",      // { level, stats }

  // --- 戦闘 ---
  ENEMY_APPEARED:  "battle:enemyAppeared",// { enemy }
  ENEMY_DAMAGED:   "battle:enemyDamaged", // { enemy, damage }
  ENEMY_DEFEATED:  "battle:enemyDefeated",// { enemy }
  PLAYER_DAMAGED:  "battle:playerDamaged",// { enemy, damage, playerDown }
  REGION_CLEARED:  "battle:regionCleared",// { region }
  GAME_CLEARED:    "battle:gameCleared",

  // --- コレクション ---
  DEX_UNLOCKED:    "dex:unlocked",        // { prefectureId, field }

  // --- 永続化・設定 ---
  STATE_CHANGED:   "state:changed",       // { state }
  SETTINGS_CHANGED:"settings:changed",    // { settings }
  SAVE_WRITTEN:    "save:written",
});

/** アプリ全体で共有する単一のバス */
export const bus = new EventBus();
