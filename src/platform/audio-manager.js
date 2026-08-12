/**
 * audio-manager.js ― 効果音。音声ファイルを1つも使わずに Web Audio で合成する。
 *
 * ■ なぜ合成するのか
 *   ・mp3 を9種類置くと配信サイズが増え、オフライン配布が重くなる
 *   ・素材のライセンス管理が要らない
 *   ・音の高さや長さをコードで調整でき、鳴りすぎを後から抑えられる
 *
 * ■ iPad で音を鳴らすための約束ごと
 *   iOS は「ユーザーが画面を触った瞬間」にしか音を出しはじめられない。
 *   そこで最初のタップで AudioContext を起こす（unlock）。
 *   これを忘れると「PCでは鳴るのに iPad で無音」という定番の不具合になる。
 *
 * ■ 画面との関係
 *   この仕組みは画面を一切知らない。EventBus のイベントを聞いて鳴らすだけ。
 *   音を止めたいときは設定を false にすればよく、他のコードは何も変わらない。
 */

import { bus, Events } from "../core/event-bus.js";

/** 音の種類ごとの設計。周波数はヘルツ、長さは秒 */
const SOUNDS = {
  /** ○ 正解: 明るく上がる2音 */
  correct: [
    { freq: 784, start: 0,     dur: 0.09, type: "triangle", gain: 0.28 },
    { freq: 1175, start: 0.08, dur: 0.16, type: "triangle", gain: 0.26 },
  ],
  /** △ おしい: 中くらいの1音 */
  partial: [
    { freq: 587, start: 0,     dur: 0.10, type: "triangle", gain: 0.26 },
    { freq: 659, start: 0.09,  dur: 0.14, type: "triangle", gain: 0.22 },
  ],
  /** × ちがう: 低く下がる。responsibility を感じさせすぎない短さにしている */
  wrong: [
    { freq: 311, start: 0,    dur: 0.11, type: "sawtooth", gain: 0.18 },
    { freq: 233, start: 0.10, dur: 0.16, type: "sawtooth", gain: 0.16 },
  ],
  /** レベルアップ: 上がっていくアルペジオ */
  levelUp: [
    { freq: 523,  start: 0,    dur: 0.10, type: "square", gain: 0.20 },
    { freq: 659,  start: 0.09, dur: 0.10, type: "square", gain: 0.20 },
    { freq: 784,  start: 0.18, dur: 0.10, type: "square", gain: 0.20 },
    { freq: 1047, start: 0.27, dur: 0.28, type: "square", gain: 0.22 },
  ],
  /** 敵に命中 */
  hit: [
    { freq: 180, start: 0, dur: 0.09, type: "square", gain: 0.20, sweepTo: 90 },
  ],
  /** 敵を倒した */
  defeat: [
    { freq: 880, start: 0,    dur: 0.08, type: "triangle", gain: 0.22 },
    { freq: 660, start: 0.07, dur: 0.08, type: "triangle", gain: 0.20 },
    { freq: 440, start: 0.14, dur: 0.22, type: "triangle", gain: 0.20, sweepTo: 220 },
  ],
  /** 反撃を受けた */
  damage: [
    { freq: 140, start: 0, dur: 0.22, type: "sawtooth", gain: 0.20, sweepTo: 70 },
  ],
  /** 地方制覇のファンファーレ */
  fanfare: [
    { freq: 523, start: 0,    dur: 0.12, type: "square", gain: 0.20 },
    { freq: 523, start: 0.13, dur: 0.10, type: "square", gain: 0.20 },
    { freq: 659, start: 0.24, dur: 0.12, type: "square", gain: 0.20 },
    { freq: 784, start: 0.37, dur: 0.34, type: "square", gain: 0.24 },
  ],
  /** 全国制覇 */
  victory: [
    { freq: 523,  start: 0,    dur: 0.14, type: "square", gain: 0.20 },
    { freq: 659,  start: 0.15, dur: 0.14, type: "square", gain: 0.20 },
    { freq: 784,  start: 0.30, dur: 0.14, type: "square", gain: 0.20 },
    { freq: 1047, start: 0.45, dur: 0.20, type: "square", gain: 0.22 },
    { freq: 784,  start: 0.66, dur: 0.14, type: "square", gain: 0.20 },
    { freq: 1047, start: 0.80, dur: 0.50, type: "square", gain: 0.26 },
  ],
};

export class AudioManager {
  #context = null;
  #master = null;
  #enabled = true;
  #unsubscribes = [];

  /**
   * @param {object} store 設定（sound）を読むために使う
   */
  constructor(store) {
    this.#enabled = store.settings.sound;
    this.#listenToSettings(store);
    this.#installUnlock();
    this.#subscribeToGameEvents();
  }

  setEnabled(enabled) {
    this.#enabled = enabled;
  }

  /**
   * 音を鳴らす。
   * 鳴らせない状況（設定オフ、未対応ブラウザ、まだ触られていない）では
   * 静かに何もしない。音のせいでゲームが止まることは無い。
   */
  play(name) {
    if (!this.#enabled) return;
    const recipe = SOUNDS[name];
    if (!recipe) return;

    const context = this.#ensureContext();
    if (!context || context.state !== "running") return;

    const now = context.currentTime;
    for (const note of recipe) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = note.type;
      oscillator.frequency.setValueAtTime(note.freq, now + note.start);
      if (note.sweepTo) {
        oscillator.frequency.exponentialRampToValueAtTime(
          note.sweepTo, now + note.start + note.dur);
      }

      // 立ち上がりと減衰をつける。いきなり切ると「プツッ」と鳴る
      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(note.gain, now + note.start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.dur);

      oscillator.connect(gain);
      gain.connect(this.#master);
      oscillator.start(now + note.start);
      oscillator.stop(now + note.start + note.dur + 0.02);
    }
  }

  dispose() {
    for (const off of this.#unsubscribes) off();
    this.#unsubscribes = [];
    this.#context?.close?.();
    this.#context = null;
  }

  /* --- 内部 -------------------------------------------------------------- */

  #ensureContext() {
    if (this.#context) return this.#context;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;

    this.#context = new Ctor();
    this.#master = this.#context.createGain();
    this.#master.gain.value = 0.7;
    this.#master.connect(this.#context.destination);
    return this.#context;
  }

  /**
   * iOS / Safari の自動再生制限を解除する。
   * 最初のタップで AudioContext を起こし、以後は普通に鳴らせるようにする。
   */
  #installUnlock() {
    const unlock = () => {
      const context = this.#ensureContext();
      context?.resume?.().catch(() => {});
      if (context?.state === "running") {
        document.removeEventListener("pointerdown", unlock);
        document.removeEventListener("keydown", unlock);
      }
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
  }

  #listenToSettings(store) {
    this.#unsubscribes.push(
      bus.on(Events.SETTINGS_CHANGED, ({ settings }) => {
        this.#enabled = settings.sound;
      })
    );
    // 初期値も反映しておく
    this.#enabled = store.settings.sound;
  }

  /**
   * ゲームの出来事に音を割り当てる。
   * 画面側に「ここで音を鳴らす」と書かずに済むのが EventBus の利点。
   */
  #subscribeToGameEvents() {
    const on = (event, handler) => this.#unsubscribes.push(bus.on(event, handler));

    on(Events.ANSWER_JUDGED, ({ judgement }) => {
      if (judgement.judge === "maru") this.play("correct");
      else if (judgement.judge === "sankaku") this.play("partial");
      else this.play("wrong");
    });

    on(Events.LEVEL_UP, () => this.play("levelUp"));
    on(Events.ENEMY_DAMAGED, () => this.play("hit"));
    on(Events.PLAYER_DAMAGED, () => this.play("damage"));
    on(Events.ENEMY_DEFEATED, () => this.play("defeat"));
    on(Events.REGION_CLEARED, () => this.play("fanfare"));
    on(Events.GAME_CLEARED, () => this.play("victory"));
  }
}
