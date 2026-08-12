/**
 * records-screen.js ― きろく。
 *
 * ■ 子どもに見せたいこと
 *   ・地図が色づいていく達成感（習熟度ヒートマップ）
 *   ・「にがてな県」を責める形ではなく、次に取り組む目標として示す
 *   ・何日つづけられたか
 *
 * ■ 先生に見せたいこと
 *   ・一人ひとりの定着状況（CSV）
 *   教師モードは子どもの誤操作を防ぐための簡単な関門を置いているだけで、
 *   セキュリティではない。個人の端末で使う前提の教材なので、
 *   「うっかり消してしまう」を防げれば十分と考えている。
 */

import { el, replace, clear } from "../../utils/dom.js";
import { MapRenderer } from "../../map/map-renderer.js";
import {
  allStats, weakest, regionStats, summary,
  toPrefectureCsv, toSummaryCsv, downloadCsv,
} from "../../engine/analytics-engine.js";
import { REGION_BY_ID } from "../../content/regions.js";
import { toDateKey } from "../../core/store.js";

/** ヒートマップの色（習熟度 0 → 1） */
function masteryColor(mastery, attempted) {
  if (!attempted) return "#33456b";                       // まだ解いていない
  if (mastery >= 0.8) return "var(--c-judge-maru)";       // 定着した
  if (mastery >= 0.5) return "var(--c-exp)";              // あと少し
  if (mastery >= 0.25) return "var(--c-judge-sankaku)";   // にがて
  return "var(--c-judge-batsu)";                          // とてもにがて
}

export function RecordsScreen({ store, router }) {
  const info = summary(store);
  const stats = allStats(store);
  const overlay = el("div", { class: "overlay-slot" });

  // 習熟度で塗り分けた地図
  const map = new MapRenderer({ interactive: false, showLabels: false });
  for (const stat of stats) {
    map.setColor(stat.id, masteryColor(stat.mastery, stat.attempts > 0));
  }

  const root = el("div", { class: "screen records-screen" },
    el("header", { class: "topbar" },
      el("button", { class: "btn btn--sub", onClick: () => router.back() }, "◀ もどる"),
      el("h2", { class: "topbar__title", "data-autofocus": "" }, "きろく"),
      el("div", { class: "topbar__spacer" }),
      el("button", {
        class: "btn btn--sub",
        onClick: () => openTeacherMode(store, overlay),
      }, "せんせいメニュー")
    ),

    el("div", { class: "records-screen__body scrollable" },
      // --- まとめ ---
      el("div", { class: "stat-row" },
        statCard("といた もんだい", `${info.totalQuestions}問`),
        statCard("れんぞく学習", `${info.dayStreak}日`),
        statCard("おぼえた県", `${info.masteredCount} / 47`),
        statCard("正答率", info.accuracy === null ? "―" : `${Math.round(info.accuracy * 100)}％`)
      ),

      // --- 地図 ---
      el("div", { class: "panel" },
        el("h3", { class: "panel__title" }, "おぼえぐあい マップ"),
        el("div", { class: "records-screen__map map-screen__stage" }, map.element),
        legend()
      ),

      // --- にがて ---
      el("div", { class: "panel" },
        el("h3", { class: "panel__title" }, "つぎに がんばりたい県"),
        weakList(store)
      ),

      // --- 地方ごと ---
      el("div", { class: "panel" },
        el("h3", { class: "panel__title" }, "地方ごとの おぼえぐあい"),
        regionList(store)
      ),

      // --- カレンダー ---
      el("div", { class: "panel" },
        el("h3", { class: "panel__title" }, "がんばった日"),
        calendarStrip(store),
        el("p", { class: "result-card__reading" },
          `これまでに ${info.studyDayCount}日 学習しました。`)
      )
    ),

    overlay
  );

  return { root };
}

/* ---------------------------------------------------------------------------
 * 部品
 * ------------------------------------------------------------------------- */

function statCard(label, value) {
  return el("div", { class: "stat-card" },
    el("div", { class: "stat-card__value" }, value),
    el("div", { class: "stat-card__label" }, label)
  );
}

function legend() {
  const items = [
    ["おぼえた", "var(--c-judge-maru)"],
    ["あと少し", "var(--c-exp)"],
    ["にがて", "var(--c-judge-sankaku)"],
    ["とてもにがて", "var(--c-judge-batsu)"],
    ["まだ", "#33456b"],
  ];
  return el("div", { class: "legend" },
    items.map(([label, color]) =>
      el("span", { class: "legend__item" },
        el("span", { class: "legend__swatch", style: { background: color } }),
        label))
  );
}

/** 苦手な県の一覧。責める言い方をしないよう文言に気をつけている */
function weakList(store) {
  const list = weakest(store, 5);
  if (list.length === 0) {
    return el("p", {}, "まだ データが ありません。もんだいに ちょうせんしてみよう！");
  }

  return el("div", { class: "weak-list" },
    list.map((stat) => el("div", { class: "weak-list__row" },
      el("span", { class: "weak-list__name" }, stat.fullName),
      el("div", { class: "bar" },
        el("div", {
          class: "bar__fill",
          style: {
            width: `${Math.round(stat.mastery * 100)}%`,
            background: masteryColor(stat.mastery, true),
          },
        }),
        el("span", { class: "bar__label" }, `${Math.round(stat.mastery * 100)}％`)
      ),
      el("span", { class: "weak-list__note" },
        stat.isDue ? "ふくしゅうの日！" : `あと${stat.daysUntilDue}日`)
    ))
  );
}

function regionList(store) {
  return el("div", { class: "region-progress" },
    regionStats(store).map((region) => el("div", { class: "region-progress__row" },
      el("span", { class: "region-progress__name" }, region.name),
      el("div", { class: "bar" },
        el("div", {
          class: "bar__fill",
          style: {
            width: `${Math.round(region.mastery * 100)}%`,
            background: `var(${region.colorVar})`,
          },
        })
      ),
      el("span", { class: "region-progress__count" },
        `${region.mastered}/${region.total}`)
    ))
  );
}

/**
 * 直近28日のカレンダー。
 * 「毎日ちょっとずつ」を目に見える形にすると続けやすい。
 */
function calendarStrip(store) {
  const studied = new Set(store.stats.studyDays);
  const days = [];
  const today = new Date();

  for (let offset = 27; offset >= 0; offset--) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = toDateKey(date);
    days.push(el("span", {
      class: `calendar__day ${studied.has(key) ? "is-studied" : ""}`,
      title: key,
      "aria-label": `${date.getMonth() + 1}月${date.getDate()}日 ` +
                    (studied.has(key) ? "学習した" : "学習していない"),
    }, String(date.getDate())));
  }
  return el("div", { class: "calendar" }, days);
}

/* ---------------------------------------------------------------------------
 * 教師モード
 * ------------------------------------------------------------------------- */

/**
 * 子どもがうっかり開かないよう、かけ算の関門を置く。
 * これは「鍵」ではなく「速度制限」。本気で守るものではないので、
 * 複雑なパスワードにして先生の手間を増やすことはしない。
 */
function openTeacherMode(store, overlay) {
  const a = 6 + Math.floor(Math.random() * 7);   // 6..12
  const b = 6 + Math.floor(Math.random() * 7);
  const answer = a * b;

  const input = el("input", {
    type: "number",
    inputmode: "numeric",
    class: "text-input",
    "aria-label": "かけ算のこたえ",
  });
  const message = el("p", { class: "result-card__reading" },
    "先生用のメニューです。児童の誤操作をふせぐため、答えを入力してください。");

  const submit = () => {
    if (Number(input.value) === answer) showTeacherMenu(store, overlay);
    else replace(message, "こたえが ちがいます。もういちど。");
  };

  replace(overlay, el("div", {
    class: "modal-backdrop",
    onClick: (event) => { if (event.target.classList.contains("modal-backdrop")) clear(overlay); },
  },
    el("div", { class: "modal panel", role: "dialog", "aria-modal": "true" },
      el("h2", { "data-autofocus": "" }, "せんせいメニュー"),
      message,
      el("p", { class: "result-card__answer" }, `${a} × ${b} = ?`),
      input,
      el("div", { class: "result-card__actions" },
        el("button", { class: "btn", onClick: submit }, "OK"),
        el("button", { class: "btn btn--sub", onClick: () => clear(overlay) }, "やめる"))
    )
  ));
  input.focus();
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") submit(); });
}

function showTeacherMenu(store, overlay) {
  const info = summary(store);
  const stamp = toDateKey(new Date());
  const safeName = (store.player.name || "児童").replace(/[\\/:*?"<>|]/g, "_");

  replace(overlay, el("div", {
    class: "modal-backdrop",
    onClick: (event) => { if (event.target.classList.contains("modal-backdrop")) clear(overlay); },
  },
    el("div", { class: "modal panel", role: "dialog", "aria-modal": "true" },
      el("h2", { "data-autofocus": "" }, "せんせいメニュー"),

      el("dl", { class: "dex-detail__list" },
        row("児童名", info.playerName),
        row("解いた問題数", `${info.totalQuestions}問`),
        row("学習時間", `${info.totalMinutes}分`),
        row("学習した日数", `${info.studyDayCount}日（連続 ${info.dayStreak}日）`),
        row("学習ずみの県", `${info.touchedCount} / 47`),
        row("習熟した県", `${info.masteredCount} / 47`),
        row("復習が必要な県", `${info.dueCount}県`),
        row("全体正答率", info.accuracy === null ? "―" : `${Math.round(info.accuracy * 100)}％`)
      ),

      el("p", { class: "result-card__reading" },
        "CSVは Excel でそのまま開けます（文字化け対策ずみ）。"),

      el("div", { class: "result-card__actions" },
        el("button", {
          class: "btn",
          onClick: () => downloadCsv(`${safeName}_県べつ_${stamp}.csv`, toPrefectureCsv(store)),
        }, "県べつCSV"),
        el("button", {
          class: "btn",
          onClick: () => downloadCsv(`${safeName}_まとめ_${stamp}.csv`, toSummaryCsv(store)),
        }, "まとめCSV"),
        el("button", { class: "btn btn--sub", onClick: () => clear(overlay) }, "とじる"))
    )
  ));
}

function row(label, value) {
  return el("div", { class: "dex-detail__row" }, el("dt", {}, label), el("dd", {}, value));
}
