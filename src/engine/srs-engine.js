/**
 * srs-engine.js ― 忘却曲線にもとづく復習間隔の計算。
 *
 * 人は覚えた直後から忘れはじめ、思い出すたびに忘れにくくなる。
 * そこで「正解したら次に出すまでの間隔を伸ばし、間違えたら短く戻す」
 * という間隔反復（Spaced Repetition）を入れている。
 *
 * 間隔は先生の指定どおり 翌日 → 3日後 → 1週間後 → 2週間後 とし、
 * その先に1か月を足して5段階にしてある。
 */

/** srsLevel（0..5）に対応する「次に出すまでの日数」 */
export const INTERVALS_DAYS = [0, 1, 3, 7, 14, 30];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 答え合わせの結果から、次の復習段階と出題予定日を求める。
 *
 * @param {number} currentLevel いまの srsLevel
 * @param {string} judge        "maru" | "sankaku" | "batsu"
 * @param {number} [now]        現在時刻（テストで固定できるように引数にしている）
 * @returns {{ srsLevel:number, nextDueAt:number }}
 */
export function nextSchedule(currentLevel, judge, now = Date.now()) {
  let level = currentLevel;

  if (judge === "maru") {
    // 漢字で正解 → 1段階進む
    level = Math.min(INTERVALS_DAYS.length - 1, level + 1);
  } else if (judge === "sankaku") {
    // 読みは合っている → 半分だけ進める（同じ段階に留める）
    level = Math.min(INTERVALS_DAYS.length - 1, Math.max(level, 1));
  } else {
    // 間違えた → 明日もう一度。ただし0には戻さず、少しだけ手心を加える
    level = Math.max(1, level - 2);
  }

  return {
    srsLevel: level,
    nextDueAt: now + INTERVALS_DAYS[level] * DAY_MS,
  };
}

/** いま復習すべきか */
export function isDue(record, now = Date.now()) {
  if (record.nextDueAt === 0) return true;   // まだ一度も解いていない
  return now >= record.nextDueAt;
}

/** あと何日で復習日が来るか（きろく画面の表示用） */
export function daysUntilDue(record, now = Date.now()) {
  if (record.nextDueAt === 0) return 0;
  return Math.max(0, Math.ceil((record.nextDueAt - now) / DAY_MS));
}
