/**
 * analytics-engine.js ― 学習記録の集計。
 *
 * ■ 何のためにあるか
 *   ・子ども向け … 「どの県がにがてか」を自分で知るため
 *   ・先生向け   … 一人ひとりの定着状況を見て、次の授業に活かすため
 *
 * ■ 気をつけていること
 *   正答率だけで「できる／できない」を決めない。
 *   1回しか解いていない県の100%と、10回解いた県の80%は意味が違う。
 *   そこで「習熟度(mastery)」は回数も加味して出している。
 *
 * ■ 計算だけを行う
 *   ここでは状態を一切書き換えない。画面もCSVも、同じ集計結果を受け取る。
 */

import { PREFECTURES, PREFECTURE_BY_ID } from "../content/prefectures.js";
import { REGIONS, REGION_BY_ID } from "../content/regions.js";
import { isDue, daysUntilDue } from "./srs-engine.js";
import { countDayStreak } from "../core/store.js";

/** 習熟したとみなす連続正解数 */
const MASTERY_STREAK = 3;

/**
 * 1県ぶんの集計。
 * @returns {object}
 */
export function statsOf(store, prefectureId, now = Date.now()) {
  const prefecture = PREFECTURE_BY_ID.get(prefectureId);
  const record = store.progressOf(prefectureId);

  const nameAttempts = record.nameCorrect + record.nameKana + record.nameWrong;
  const capAttempts  = record.capCorrect  + record.capKana  + record.capWrong;
  const attempts = nameAttempts + capAttempts;

  const correct = record.nameCorrect + record.nameKana + record.capCorrect + record.capKana;
  const kanjiCorrect = record.nameCorrect + record.capCorrect;

  return {
    id: prefectureId,
    name: prefecture?.name ?? "",
    fullName: (prefecture?.name ?? "") + (prefecture?.suffix ?? ""),
    reading: prefecture?.reading ?? "",
    capital: (prefecture?.capital ?? "") + (prefecture?.capitalSuffix ?? ""),
    region: prefecture?.region ?? "",
    regionName: REGION_BY_ID.get(prefecture?.region)?.name ?? "",

    nameCorrect: record.nameCorrect,
    nameKana: record.nameKana,
    nameWrong: record.nameWrong,
    capCorrect: record.capCorrect,
    capKana: record.capKana,
    capWrong: record.capWrong,

    attempts,
    correct,
    wrong: record.nameWrong + record.capWrong,
    accuracy: attempts === 0 ? null : correct / attempts,
    kanjiRate: attempts === 0 ? null : kanjiCorrect / attempts,

    avgMs: record.answered === 0 ? null : Math.round(record.totalMs / record.answered),
    hintUsed: record.hintUsed,
    streak: record.streak,
    lastJudge: record.lastJudge,

    srsLevel: record.srsLevel,
    isDue: attempts > 0 && isDue(record, now),
    daysUntilDue: daysUntilDue(record, now),

    mastery: masteryOf(record),
  };
}

/**
 * 習熟度 0..1。
 *   ・まだ解いていない → 0
 *   ・漢字で連続正解しているほど高い
 *   ・間違えた回数が多いほど下がる
 * 「正答率」だけを見ると1回まぐれ当たりした県が満点になるので、
 * 連続正解と回数を組み合わせている。
 */
export function masteryOf(record) {
  const attempts = record.nameCorrect + record.nameKana + record.nameWrong
                 + record.capCorrect + record.capKana + record.capWrong;
  if (attempts === 0) return 0;

  const kanji = record.nameCorrect + record.capCorrect;
  const kana = record.nameKana + record.capKana;
  // 漢字での正解を1点、ひらがなを0.6点として数える
  const score = (kanji + kana * 0.6) / attempts;

  // 連続正解ボーナス（3連続で満点扱い）
  const streakFactor = Math.min(1, record.streak / MASTERY_STREAK);

  return Math.max(0, Math.min(1, score * 0.7 + streakFactor * 0.3));
}

/** 47県すべての集計 */
export function allStats(store, now = Date.now()) {
  return PREFECTURES.map((p) => statsOf(store, p.id, now));
}

/**
 * 苦手な順に並べる。
 * 「一度も解いていない県」は苦手ではないので除く（まだ知らないだけ）。
 */
export function weakest(store, limit = 5, now = Date.now()) {
  return allStats(store, now)
    .filter((s) => s.attempts > 0)
    .sort((a, b) => {
      // まず間違えた回数、次に習熟度の低さで並べる
      if (b.wrong !== a.wrong) return b.wrong - a.wrong;
      return a.mastery - b.mastery;
    })
    .slice(0, limit);
}

/** 地方ごとの習熟度 */
export function regionStats(store, now = Date.now()) {
  const stats = allStats(store, now);
  return REGIONS.map((region) => {
    const inRegion = stats.filter((s) => s.region === region.id);
    const learned = inRegion.filter((s) => s.attempts > 0);
    const mastered = inRegion.filter((s) => s.mastery >= 0.8);
    const mastery = inRegion.length === 0 ? 0
      : inRegion.reduce((sum, s) => sum + s.mastery, 0) / inRegion.length;

    return {
      id: region.id,
      name: region.name,
      colorVar: region.colorVar,
      total: inRegion.length,
      learned: learned.length,
      mastered: mastered.length,
      mastery,
    };
  });
}

/** 全体のまとめ */
export function summary(store, now = Date.now()) {
  const stats = allStats(store, now);
  const attempted = stats.filter((s) => s.attempts > 0);
  const totalAttempts = stats.reduce((sum, s) => sum + s.attempts, 0);
  const totalCorrect = stats.reduce((sum, s) => sum + s.correct, 0);

  return {
    playerName: store.player.name,
    level: store.player.level,
    totalQuestions: store.stats.totalQuestions,
    totalMinutes: Math.round(store.stats.totalMs / 60000),
    dayStreak: countDayStreak(store.stats.studyDays),
    studyDayCount: store.stats.studyDays.length,
    lastStudyDay: store.stats.studyDays[store.stats.studyDays.length - 1] ?? null,
    touchedCount: attempted.length,
    masteredCount: stats.filter((s) => s.mastery >= 0.8).length,
    dueCount: stats.filter((s) => s.isDue).length,
    accuracy: totalAttempts === 0 ? null : totalCorrect / totalAttempts,
    clearedRegions: store.battle.clearedRegions.length,
    demonLordDefeated: store.battle.demonLordDefeated,
  };
}

/* ---------------------------------------------------------------------------
 * CSV 書き出し（教師モード）
 * ------------------------------------------------------------------------- */

/**
 * Excel は BOM が無いと UTF-8 の日本語を文字化けさせる。
 * 先生が「開いたら文字化けした」となるのがいちばん困るので必ず付ける。
 */
const BOM = "﻿";

/** CSV の1セルを安全な形にする */
function cell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const toRow = (values) => values.map(cell).join(",");
const percent = (ratio) => (ratio === null ? "" : Math.round(ratio * 100));
const seconds = (ms) => (ms === null ? "" : (ms / 1000).toFixed(1));
const dateOf = (epoch) => (epoch ? new Date(epoch).toLocaleDateString("ja-JP") : "");

const JUDGE_LABEL = { maru: "○", sankaku: "△", batsu: "×" };

/** 県べつの詳細CSV（47行） */
export function toPrefectureCsv(store, now = Date.now()) {
  const header = [
    "都道府県", "よみ", "県庁所在地", "地方",
    "県名:漢字正解", "県名:かな正解", "県名:まちがい",
    "所在地:漢字正解", "所在地:かな正解", "所在地:まちがい",
    "解答回数", "正答率(%)", "漢字正答率(%)", "習熟度(%)",
    "平均解答時間(秒)", "ヒント使用", "連続正解", "最終判定",
    "復習段階", "次の復習まで(日)",
  ];

  const rows = allStats(store, now).map((s) => toRow([
    s.fullName, s.reading, s.capital, `${s.regionName}地方`,
    s.nameCorrect, s.nameKana, s.nameWrong,
    s.capCorrect, s.capKana, s.capWrong,
    s.attempts, percent(s.accuracy), percent(s.kanjiRate), percent(s.mastery),
    seconds(s.avgMs), s.hintUsed, s.streak, JUDGE_LABEL[s.lastJudge] ?? "",
    s.srsLevel, s.attempts > 0 ? s.daysUntilDue : "",
  ]));

  return BOM + [toRow(header), ...rows].join("\r\n") + "\r\n";
}

/** 学習全体のまとめCSV（1行） */
export function toSummaryCsv(store, now = Date.now()) {
  const s = summary(store, now);
  const regions = regionStats(store, now);

  const header = [
    "児童名", "書き出し日", "レベル", "解いた問題数", "学習時間(分)",
    "連続学習日数", "学習した日数", "最終学習日",
    "学習ずみの県数", "習熟した県数", "復習が必要な県数", "全体正答率(%)",
    "制覇した地方数", "全国制覇",
    ...regions.map((r) => `${r.name}地方 習熟度(%)`),
  ];

  const row = [
    s.playerName, new Date(now).toLocaleDateString("ja-JP"), s.level,
    s.totalQuestions, s.totalMinutes,
    s.dayStreak, s.studyDayCount, s.lastStudyDay ?? "",
    s.touchedCount, s.masteredCount, s.dueCount, percent(s.accuracy),
    s.clearedRegions, s.demonLordDefeated ? "○" : "",
    ...regions.map((r) => Math.round(r.mastery * 100)),
  ];

  return BOM + [toRow(header), toRow(row)].join("\r\n") + "\r\n";
}

/**
 * 文字列をファイルとしてダウンロードさせる。
 * サーバを使わないので、Blob と <a download> で完結させている。
 */
export function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // すぐ revoke すると Safari でダウンロードが始まらないことがあるので少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
