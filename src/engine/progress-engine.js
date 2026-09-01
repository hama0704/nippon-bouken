/**
 * progress-engine.js ― 経験値・レベル・ステータスの成長。
 *
 * ■ 経験値の設計（先生の指定どおり）
 *     漢字で正解            100
 *     ひらがなで正解         60
 *     2回目の正解            50
 *     3回目以降の正解        20
 *     間違えた問題に正解    120  ← いちばん多い。「間違い直し」に価値を置く
 *     苦手克服ボーナス      +α   何回も間違えた県ほど大きい
 *
 *   同じ県を繰り返すだけでは伸びず、苦手に向き合うほど強くなる。
 *   「楽な作業の反復」ではなく「わからないことへの挑戦」に報酬を置いている。
 *
 * ■ ヒントを使うと減る
 *   使ってはいけないのではなく、「自力で思い出せたらもっとうれしい」
 *   と感じられる程度の差にしてある。
 */

import { bus, Events } from "../core/event-bus.js";
import { Judge } from "./scoring-engine.js";
import { nextSchedule } from "./srs-engine.js";

/** 基本の経験値 */
export const EXP_TABLE = {
  firstKanji:   100,  // はじめて漢字で正解
  firstKana:     60,  // はじめてひらがなで正解
  secondKanji:   50,  // 2回目
  secondKana:    30,
  repeatKanji:   20,  // 3回目以降
  repeatKana:    12,
  comeback:     120,  // 前回間違えた問題に正解した
};

/** ヒントを使ったときの倍率（段階ごと） */
export const HINT_PENALTY = [1, 0.9, 0.75, 0.5];

/** 苦手克服ボーナス: 間違えた回数 × この値（上限あり） */
const OVERCOME_BONUS_PER_MISS = 20;
const OVERCOME_BONUS_MAX = 120;
/** ボーナスがつきはじめる「間違えた回数」 */
const OVERCOME_MISS_THRESHOLD = 2;

/**
 * 「◯◯県」と最後まで書けたときのボーナス。
 *
 * ■ なぜ罰ではなく報酬にするか
 *   「県」を書かないと×、にすると、書き方が不安で手が止まる子が出る。
 *   覚えていないのではなく「書き方のきまり」で減点されるのは、
 *   学習の妨げにしかならない。
 *   正解は正解として認めたうえで、最後まで書けたらもっと嬉しい、
 *   という形にして習慣づける。
 */
const SUFFIX_BONUS = 20;

/** レベルアップに必要な経験値（レベル n → n+1） */
export function expToNextLevel(level) {
  return 120 + (level - 1) * 80;
}

/** レベルアップで上がるステータス */
const GROWTH = { maxHp: 6, atk: 3, def: 2, spd: 2 };

/**
 * 1問ぶんの結果を記録し、経験値・レベル・復習予定をまとめて更新する。
 *
 * 状態の書き換えは store.update() の中だけで行い、
 * 呼び出し側は結果（増えた経験値・レベルアップしたか）を受け取るだけにしている。
 *
 * @param {object} params
 * @param {object} params.store
 * @param {object} params.question    question-engine が作った問題
 * @param {string} params.judge       "maru" | "sankaku" | "batsu"
 * @param {number} params.hintLevel   使ったヒントの段階（0 = 使っていない）
 * @param {number} params.elapsedMs   考えていた時間
 * @param {number} [params.now]
 * @returns {{ exp:number, reasons:string[], leveledUp:boolean, level:number,
 *             gainedStats:object|null, overcame:boolean }}
 */
export function applyAnswer({
  store, question, judge, hintLevel = 0, elapsedMs = 0,
  wroteSuffix = false, skipped = false, now = Date.now(),
}) {
  const record = store.progressOf(question.subjectId);
  const isCapital = question.part === "capital";

  // 更新前の状態を控えておく（経験値の計算に使う）
  const before = {
    correct: isCapital ? record.capCorrect : record.nameCorrect,
    kana:    isCapital ? record.capKana    : record.nameKana,
    wrong:   isCapital ? record.capWrong   : record.nameWrong,
    lastJudge: record.lastJudge,
  };

  const { exp, reasons, overcame } = calculateExp({
    judge, hintLevel, before,
    wroteSuffix, skipped,
    suffix: question.answer?.suffix ?? "",
  });

  let leveledUp = false;
  let gainedStats = null;
  let newLevel = store.player.level;

  store.update((save) => {
    const entry = save.progress[question.subjectId];

    // --- 学習記録 ---
    if (judge === Judge.MARU) {
      if (isCapital) entry.capCorrect++; else entry.nameCorrect++;
      entry.streak++;
    } else if (judge === Judge.SANKAKU) {
      if (isCapital) entry.capKana++; else entry.nameKana++;
      entry.streak++;
    } else {
      if (isCapital) entry.capWrong++; else entry.nameWrong++;
      entry.streak = 0;
    }
    entry.lastJudge = judge;
    entry.totalMs += elapsedMs;
    entry.answered++;
    if (hintLevel > 0) entry.hintUsed++;

    // --- 次の復習日 ---
    const schedule = nextSchedule(entry.srsLevel, judge, now);
    entry.srsLevel = schedule.srsLevel;
    entry.nextDueAt = schedule.nextDueAt;

    // --- 図鑑の開放（正解した情報だけ見られるようにする）---
    const dex = save.dex[question.subjectId];
    if (judge !== Judge.BATSU) {
      if (isCapital) dex.capital = true; else dex.name = true;
      if (dex.name && dex.capital) dex.info = true;
    }

    // --- 全体の統計 ---
    save.stats.totalQuestions++;
    save.stats.totalMs += elapsedMs;

    // --- 経験値とレベルアップ ---
    save.player.exp += exp;
    while (save.player.exp >= expToNextLevel(save.player.level)) {
      save.player.exp -= expToNextLevel(save.player.level);
      save.player.level++;
      save.player.maxHp += GROWTH.maxHp;
      save.player.hp = save.player.maxHp;   // レベルアップで全回復
      save.player.atk += GROWTH.atk;
      save.player.def += GROWTH.def;
      save.player.spd += GROWTH.spd;
      leveledUp = true;
      gainedStats = { ...GROWTH };
      newLevel = save.player.level;
    }
  });

  store.markStudiedToday(new Date(now));

  // 効果音やアニメはこのイベントを聞いて反応する。
  // 「経験値が入ったら音を鳴らす」をここに書かないことで、
  // 音を消しても、演出を変えても、この計算は一切影響を受けない。
  if (exp > 0) bus.emit(Events.EXP_GAINED, { amount: exp, reasons });
  if (leveledUp) bus.emit(Events.LEVEL_UP, { level: newLevel, stats: gainedStats });

  return { exp, reasons, leveledUp, level: newLevel, gainedStats, overcame };
}

/**
 * 経験値の内訳を計算する（状態は変えない）。
 * 画面に「なぜこの経験値になったか」を出せるよう、理由も返す。
 */
export function calculateExp({
  judge, hintLevel = 0, before, wroteSuffix = false, suffix = "", skipped = false,
}) {
  if (judge === Judge.BATSU) {
    return {
      exp: 0,
      reasons: [skipped
        ? "こたえを見た（つぎに正解すると 120けいけんち！）"
        : "まちがえた（つぎに正解すると 120けいけんち！）"],
      overcame: false,
    };
  }

  const isKanji = judge === Judge.MARU;
  const timesCorrect = before.correct + before.kana;   // これまでに正解した回数
  const reasons = [];
  let base;

  if (before.lastJudge === Judge.BATSU) {
    // 前回まちがえた問題に正解した ＝ 間違い直しができた
    base = EXP_TABLE.comeback;
    reasons.push("まちがい直しができた！");
  } else if (timesCorrect === 0) {
    base = isKanji ? EXP_TABLE.firstKanji : EXP_TABLE.firstKana;
    reasons.push(isKanji ? "はじめて かんじで正解！" : "はじめて 正解（ひらがな）");
  } else if (timesCorrect === 1) {
    base = isKanji ? EXP_TABLE.secondKanji : EXP_TABLE.secondKana;
    reasons.push("2回目の正解");
  } else {
    base = isKanji ? EXP_TABLE.repeatKanji : EXP_TABLE.repeatKana;
    reasons.push("くりかえし正解");
  }

  // 苦手克服ボーナス
  let bonus = 0;
  const overcame = before.wrong >= OVERCOME_MISS_THRESHOLD;
  if (overcame) {
    bonus = Math.min(OVERCOME_BONUS_MAX, before.wrong * OVERCOME_BONUS_PER_MISS);
    reasons.push(`にがて克服ボーナス +${bonus}（${before.wrong}回まちがえた県）`);
  }

  // 「◯◯県」と最後まで書けたボーナス。
  // 接尾辞が無い答え（北海道・東京の都庁所在地）ではボーナス自体が発生しない
  if (wroteSuffix && suffix) {
    bonus += SUFFIX_BONUS;
    reasons.push(`「${suffix}」まで書けたボーナス +${SUFFIX_BONUS}`);
  }

  // ヒントぶんの減点
  const penalty = HINT_PENALTY[Math.min(hintLevel, HINT_PENALTY.length - 1)];
  if (penalty < 1) {
    reasons.push(`ヒントを${hintLevel}回つかった（×${penalty}）`);
  }

  return { exp: Math.round((base + bonus) * penalty), reasons, overcame };
}

/** 経験値バーの表示に使う「いまのレベル内での進み具合」 */
export function levelProgress(player) {
  const needed = expToNextLevel(player.level);
  return { current: player.exp, needed, ratio: Math.min(1, player.exp / needed) };
}
