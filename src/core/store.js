/**
 * store.js ― アプリ唯一の状態置き場。
 *
 * セーブデータの構造 = 実行時の状態の構造、と一致させている。
 * こうしておくと「保存されるもの／されないもの」を考えずに済み、
 * デバッグ時も localStorage の中身をそのまま読めば現状が分かる。
 *
 * 一時的な状態（今どの画面か、今の問題は何か）は session に置き、保存しない。
 */

import { bus, Events } from "./event-bus.js";
import * as SaveManager from "./save-manager.js";

export class Store {
  /** @type {object} 永続化される状態 */
  #save;
  /** @type {object} 保存しない一時状態 */
  #session;

  constructor(subjectIds) {
    const { save, isNew } = SaveManager.loadSave(subjectIds);
    this.#save = save;
    this.#session = {
      isNewGame: isNew,
      screen: null,
      mode: null,          // "name" | "capital" | "both"
      options: null,       // 難易度・出題範囲の設定
      question: null,      // 出題中の問題
      queue: [],           // 出題キュー
      questionCount: 0,    // このセッションで解いた数
      sessionStartedAt: Date.now(),
      lastResult: null,    // 直前の採点結果（結果画面が読む）
    };
  }

  /* --- 読み取り ---------------------------------------------------------- */

  /** 永続状態への参照（読み取り専用のつもりで扱う） */
  get save()     { return this.#save; }
  get player()   { return this.#save.player; }
  get progress() { return this.#save.progress; }
  get dex()      { return this.#save.dex; }
  get battle()   { return this.#save.battle; }
  get stats()    { return this.#save.stats; }
  get settings() { return this.#save.settings; }
  get session()  { return this.#session; }

  /** 1件ぶんの学習記録を取り出す（無ければ作る） */
  progressOf(subjectId) {
    if (!this.#save.progress[subjectId]) {
      this.#save.progress[subjectId] = SaveManager.createProgressEntry();
    }
    return this.#save.progress[subjectId];
  }

  dexOf(subjectId) {
    if (!this.#save.dex[subjectId]) {
      this.#save.dex[subjectId] = SaveManager.createDexEntry();
    }
    return this.#save.dex[subjectId];
  }

  /* --- 書き込み ---------------------------------------------------------- */

  /**
   * 状態を書き換える唯一の入口。
   * 直接 store.player.exp = ... と書かず必ずこれを通すことで、
   * 「保存し忘れ」と「変更通知の漏れ」を構造的に防ぐ。
   *
   * @param {(save: object) => void} mutator 状態を書き換える関数
   */
  update(mutator) {
    mutator(this.#save);
    SaveManager.scheduleSave(this.#save, () => bus.emit(Events.SAVE_WRITTEN));
    bus.emit(Events.STATE_CHANGED, { state: this.#save });
  }

  /** 一時状態の更新（保存されない） */
  updateSession(patch) {
    Object.assign(this.#session, patch);
  }

  /** 設定を変更し、即座に画面へ反映する */
  updateSettings(patch) {
    this.update((save) => Object.assign(save.settings, patch));
    applySettingsToDocument(this.#save.settings);
    bus.emit(Events.SETTINGS_CHANGED, { settings: this.#save.settings });
  }

  /** 今すぐ保存する（アプリが背面に回るときなど） */
  flush() {
    SaveManager.saveNow(this.#save, () => bus.emit(Events.SAVE_WRITTEN));
  }

  /** 記録をすべて消して最初から始める */
  resetAll(subjectIds) {
    SaveManager.clearSave();
    this.#save = SaveManager.createNewSave(subjectIds);
    this.#session.isNewGame = true;
    applySettingsToDocument(this.#save.settings);
    this.update(() => {});
  }

  /* --- 学習日の記録 ------------------------------------------------------ */

  /**
   * 「今日勉強した」ことを記録し、連続学習日数を更新する。
   * 毎問呼んでよい（同じ日は二重に数えない）。
   */
  markStudiedToday(today = new Date()) {
    const key = toDateKey(today);
    const days = this.#save.stats.studyDays;
    if (days[days.length - 1] === key) return;

    this.update((save) => {
      save.stats.studyDays.push(key);
      // 直近365日ぶんだけ残す（無限に増やさない）
      if (save.stats.studyDays.length > 365) save.stats.studyDays.shift();
      save.stats.dayStreak = countDayStreak(save.stats.studyDays);
    });
  }
}

/** Date → "2026-08-04" */
export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 末尾から連続している日数を数える */
export function countDayStreak(dayKeys) {
  if (dayKeys.length === 0) return 0;
  let streak = 1;
  for (let i = dayKeys.length - 1; i > 0; i--) {
    const current = new Date(dayKeys[i]);
    const previous = new Date(dayKeys[i - 1]);
    const diffDays = Math.round((current - previous) / 86_400_000);
    if (diffDays === 1) streak++;
    else break;
  }
  return streak;
}

/**
 * 設定を <html> の data 属性に反映する。
 * CSS 側（tokens.css / base.css）がこの属性を見て見た目を切り替えるので、
 * JS 側は属性を書くだけでよい。
 */
export function applySettingsToDocument(settings) {
  const root = document.documentElement;
  root.dataset.font     = settings.fontScale;
  root.dataset.cvd      = settings.cvdMode ? "on" : "off";
  root.dataset.furigana = settings.furigana ? "on" : "off";
  root.dataset.hand     = settings.handedness;
  root.dataset.motion   = settings.reduceMotion ? "reduce" : "full";
}
