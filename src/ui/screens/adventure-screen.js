/**
 * adventure-screen.js ― 冒険マップ。日本地図と進行状況を見せる拠点画面。
 *
 * ここから問題画面へ出発する。県をタップすると、その県の学習状況が見られる。
 */

import { el, replace } from "../../utils/dom.js";
import { MapRenderer } from "../../map/map-renderer.js";
import {
  PREFECTURES, PREFECTURE_BY_ID, fullName, fullCapital, prefecturesOfRegion,
} from "../../content/prefectures.js";
import { REGIONS } from "../../content/regions.js";
import { BattleEngine } from "../../engine/battle-engine.js";
import { createEnemyArt } from "../components/enemy-art.js";
import { levelProgress } from "../../engine/progress-engine.js";

export function AdventureScreen({ store, router, params }) {
  const mode = params.mode ?? store.session.mode ?? "name";
  const options = params.options ?? store.session.options ?? {};

  const detail = el("div", { class: "panel" },
    el("p", {}, "地図の県をタップすると、くわしく見られるよ。"));

  const map = new MapRenderer({
    onSelect: (prefectureId) => replace(detail, ...prefectureDetail(store, prefectureId)),
  });
  paintProgress(map, store, options.regionFilter);

  const root = el("div", { class: "screen map-screen" },
    el("header", { class: "topbar" },
      el("button", { class: "btn btn--sub", onClick: () => router.back() }, "◀ もどる"),
      el("h2", { class: "topbar__title", "data-autofocus": "" }, "ぼうけんマップ"),
      el("div", { class: "topbar__spacer" }),
      el("span", {}, `Lv.${store.player.level}`)
    ),

    el("div", { class: "map-screen__body" },
      el("div", { class: "map-screen__stage" }, map.element),

      el("aside", { class: "map-screen__side" },
        questCard(store, options),
        el("div", { class: "panel" },
          el("h3", { class: "panel__title" }, "地方の しんこう"),
          regionProgressList(store)
        ),
        detail,
        el("button", {
          class: "btn btn--lg btn--block",
          onClick: () => router.go("quiz", { mode, options }),
        }, "もんだいに ちょうせん ▶")
      )
    )
  );

  return { root };
}

/* ---------------------------------------------------------------------------
 * 地図の塗り分け
 * ------------------------------------------------------------------------- */

/**
 * 学習状況を地図の色に反映する。
 *   cleared … 一度でも漢字で正解した
 *   weak    … 直近で間違えた／正答率が低い
 *   locked  … まだ手をつけていない
 * 地方しぼりが有効なときは、対象外の県を locked のまま沈ませる。
 */
function paintProgress(map, store, regionFilter) {
  for (const prefecture of PREFECTURES) {
    if (regionFilter && prefecture.region !== regionFilter) {
      map.setState(prefecture.id, "locked");
      continue;
    }
    map.setState(prefecture.id, stateOf(store.progressOf(prefecture.id)));
  }
}

function stateOf(record) {
  const correct = record.nameCorrect + record.capCorrect;
  const wrong = record.nameWrong + record.capWrong;
  if (correct === 0 && wrong === 0) return "locked";
  if (record.lastJudge === "batsu" || wrong > correct) return "weak";
  if (correct > 0) return "cleared";
  return "default";
}

/* ---------------------------------------------------------------------------
 * サイドパネル
 * ------------------------------------------------------------------------- */

/**
 * いまの冒険の状況（どこで誰と戦っているか、こちらの強さ）。
 * 問題に入る前に「これから何をするのか」が分かるようにしている。
 */
function questCard(store, options = {}) {
  const battle = new BattleEngine(store);
  const progress = levelProgress(store.player);

  if (battle.isGameCleared) {
    return el("div", { class: "panel" },
      el("h3", { class: "panel__title" }, "全国制覇ずみ！"),
      el("p", {}, "魔王をたおしたあとも、苦手な県のふくしゅうは つづけられるよ。")
    );
  }

  const enemy = battle.enemy;
  const { index, total } = battle.regionProgress;

  return el("div", { class: "panel" },
    // 「ちょうせん中」とは書かない。
    // 全国モードでは、その地方の県が出やすくなるだけで、他の地方の問題も出る。
    // 地方名は「敵がいる場所」であって「出題範囲」ではないので、
    // 出題範囲は下の行で別に示している。
    el("h3", { class: "panel__title" },
      battle.currentRegion ? `いまの たびさき：${battle.currentRegion.name}地方` : "まおうの しろ"),
    el("p", { class: "settings-note" }, questionScopeText(battle, options)),

    enemy && el("div", { class: "quest-enemy" },
      createEnemyArt(enemy, { size: 88 }),
      el("div", {},
        el("div", { class: "battle__name" }, enemy.name),
        el("div", { class: "result-card__reading" }, `${index + 1}体目 / ${total}体`),
        el("div", { class: "bar bar--enemy" },
          el("div", {
            class: "bar__fill",
            style: { width: `${(battle.enemyHp / enemy.maxHp) * 100}%` },
          }),
          el("span", { class: "bar__label" }, `${battle.enemyHp} / ${enemy.maxHp}`)
        )
      )
    ),

    el("div", { class: "result-card__reading" },
      `Lv.${store.player.level}　HP ${store.player.hp}/${store.player.maxHp}　` +
      `こうげき ${store.player.atk}　しゅび ${store.player.def}`),
    el("div", { class: "bar" },
      el("div", { class: "bar__fill", style: { width: `${progress.ratio * 100}%` } }),
      el("span", { class: "bar__label" }, `つぎのレベルまで ${progress.needed - progress.current}`)
    )
  );
}

/**
 * いま実際にどの範囲から出題されるのかを、そのまま言葉にする。
 * 画面の表示と中身がずれると、子どもは「そういうものだ」と学習してしまい、
 * 以後どの表示も信じなくなる。
 */
function questionScopeText(battle, options) {
  if (options.reviewOnly) return "出題：にがてな県と、ふくしゅうの日が来た県";
  if (options.regionFilter) {
    const region = REGIONS.find((r) => r.id === options.regionFilter);
    return `出題：${region?.name ?? ""}地方の県だけ`;
  }
  if (battle.currentRegion) {
    return `出題：ぜんこく（${battle.currentRegion.name}地方の県が 出やすい）`;
  }
  return "出題：ぜんこく";
}

/** 地方ごとの「何県クリアしたか」を横棒で並べる */
function regionProgressList(store) {
  const list = el("div", { class: "region-progress" });

  for (const region of REGIONS) {
    const prefectures = prefecturesOfRegion(region.id);
    const cleared = prefectures.filter(
      (p) => store.progressOf(p.id).nameCorrect > 0
    ).length;
    const ratio = prefectures.length === 0 ? 0 : cleared / prefectures.length;

    list.appendChild(el("div", { class: "region-progress__row" },
      el("span", { class: "region-progress__name" }, region.name),
      el("div", { class: "bar" },
        el("div", {
          class: "bar__fill",
          style: {
            width: `${Math.round(ratio * 100)}%`,
            background: `var(${region.colorVar})`,
          },
        })
      ),
      el("span", { class: "region-progress__count" },
        `${cleared}/${prefectures.length}`)
    ));
  }
  return list;
}

/** 県をタップしたときに出す詳細カード */
function prefectureDetail(store, prefectureId) {
  const prefecture = PREFECTURE_BY_ID.get(prefectureId);
  if (!prefecture) return [el("p", {}, "データがありません")];

  const record = store.progressOf(prefectureId);
  const total = record.nameCorrect + record.nameKana + record.nameWrong;
  const rate = total === 0 ? null
    : Math.round(((record.nameCorrect + record.nameKana) / total) * 100);

  // まだ正解していない県のネタバレを防ぐため、答えは開放済みのときだけ出す
  const unlocked = store.dexOf(prefectureId).name || record.nameCorrect > 0;

  return [
    el("h3", { class: "panel__title" },
      unlocked ? fullName(prefecture) : "？？？"),
    el("p", {},
      "県庁所在地：", unlocked ? fullCapital(prefecture) : "？？？"),
    el("p", {},
      "せいせき：", total === 0 ? "まだ ちょうせんしていません" : `${rate}％（${total}回）`),
    unlocked && el("p", {}, prefecture.fact),
  ].filter(Boolean);
}
