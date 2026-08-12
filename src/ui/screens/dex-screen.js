/**
 * dex-screen.js ― としょかん（図鑑）。
 *
 * ■ ねらい
 *   コレクションは「集めたくなる」ための仕掛けだが、
 *   ここでは同時に「県の形をおぼえる」教材にもしている。
 *   カードに出るのは地図と同じ形のシルエット。
 *   図鑑を眺めているうちに、形と名前が結びつく。
 *
 * ■ 開放の段階
 *   県名に正解      → 名前とシルエットの色がつく
 *   県庁所在地に正解 → 県庁所在地が見える
 *   両方に正解      → 名産・人口・有名なもの・豆知識が開く
 */

import { el, replace, clear } from "../../utils/dom.js";
import { prefectureRuby } from "../components/answer-text.js";
import { PREFECTURES, PREFECTURE_BY_ID, fullName } from "../../content/prefectures.js";
import { REGIONS, REGION_BY_ID } from "../../content/regions.js";
import { cellsOf } from "../../content/pref-shapes.js";
import { cellsToPath, boundsOf } from "../../map/shape-builder.js";
import { statsOf } from "../../engine/analytics-engine.js";

const CELL = 10;

export function DexScreen({ store, router }) {
  const state = { regionFilter: null };

  const grid = el("div", { class: "dex-grid" });
  const detail = el("div", { class: "overlay-slot" });

  const unlockedCount = PREFECTURES.filter((p) => store.dexOf(p.id).name).length;

  const filterBar = el("div", { class: "option-group" },
    el("span", { class: "option-group__label" }, "地方"),
    filterButton("ぜんぶ", null, state, () => renderGrid()),
    REGIONS.map((region) =>
      filterButton(region.name, region.id, state, () => renderGrid()))
  );

  const root = el("div", { class: "screen dex-screen" },
    el("header", { class: "topbar" },
      el("button", { class: "btn btn--sub", onClick: () => router.back() }, "◀ もどる"),
      el("h2", { class: "topbar__title", "data-autofocus": "" }, "としょかん"),
      el("div", { class: "topbar__spacer" }),
      el("span", {}, `${unlockedCount} / ${PREFECTURES.length} 県`)
    ),

    el("div", { class: "dex-screen__body scrollable" },
      filterBar,
      el("p", { class: "result-card__reading" },
        "県名に正解すると 名前とかたちが、県庁所在地にも正解すると くわしい情報が ひらくよ。"),
      grid
    ),

    detail
  );

  function renderGrid() {
    clear(grid);
    const list = state.regionFilter
      ? PREFECTURES.filter((p) => p.region === state.regionFilter)
      : PREFECTURES;

    for (const prefecture of list) {
      grid.appendChild(dexCard(store, prefecture, () => openDetail(prefecture.id)));
    }
  }

  function openDetail(prefectureId) {
    replace(detail, DetailModal({
      store,
      prefectureId,
      onClose: () => clear(detail),
    }));
  }

  renderGrid();
  return { root };
}

/* ---------------------------------------------------------------------------
 * カード
 * ------------------------------------------------------------------------- */

function dexCard(store, prefecture, onOpen) {
  const dex = store.dexOf(prefecture.id);
  const region = REGION_BY_ID.get(prefecture.region);
  const isUnlocked = dex.name;

  return el("button", {
    class: `dex-card ${isUnlocked ? "is-unlocked" : "is-locked"}`,
    onClick: onOpen,
    "aria-label": isUnlocked
      ? `${fullName(prefecture)}のカード`
      : "まだ ひらいていない カード",
  },
    silhouette(prefecture.id, isUnlocked ? `var(${region.colorVar})` : "#3a4a70"),
    el("span", { class: "dex-card__name" },
      isUnlocked ? prefecture.name : "？？？"),
    dex.info && el("span", { class: "dex-card__badge" }, "★")
  );
}

/**
 * 県の形のシルエット。
 * 地図と同じ形状データから作るので、図鑑と地図で形が食い違うことがない。
 */
function silhouette(prefectureId, fill) {
  const cells = cellsOf(prefectureId);
  const bounds = boundsOf(cells, CELL);
  // 形のまわりに少し余白をとって、はみ出さないようにする
  const pad = CELL * 0.6;

  return el("svg", {
    class: "dex-card__shape",
    viewBox: `${bounds.x - pad} ${bounds.y - pad} ` +
             `${bounds.width + pad * 2} ${bounds.height + pad * 2}`,
    preserveAspectRatio: "xMidYMid meet",
    "aria-hidden": "true",
  },
    el("path", { d: cellsToPath(cells, CELL), fill })
  );
}

/* ---------------------------------------------------------------------------
 * 詳細
 * ------------------------------------------------------------------------- */

function DetailModal({ store, prefectureId, onClose }) {
  const prefecture = PREFECTURE_BY_ID.get(prefectureId);
  const dex = store.dexOf(prefectureId);
  const region = REGION_BY_ID.get(prefecture.region);
  const stats = statsOf(store, prefectureId);

  const locked = (text) => el("span", { class: "dex-locked" }, text);

  return el("div", {
    class: "modal-backdrop",
    onClick: (event) => { if (event.target.classList.contains("modal-backdrop")) onClose(); },
  },
    el("div", { class: "modal panel", role: "dialog", "aria-modal": "true" },
      el("div", { class: "dex-detail__head" },
        silhouette(prefectureId, `var(${region.colorVar})`),
        el("div", {},
          el("h2", { "data-autofocus": "" },
            dex.name ? prefectureRuby(prefecture, "name") : "？？？"),
          el("span", {
            class: "chip",
            style: { "--chip-color": `var(${region.colorVar})` },
          }, `${region.name}地方`)
        )
      ),

      el("dl", { class: "dex-detail__list" },
        item("県庁所在地", dex.capital
          ? prefectureRuby(prefecture, "capital")
          : locked("県庁所在地モードで 正解すると ひらくよ")),
        item("人口", dex.info ? prefecture.population : locked("？？？")),
        item("名産", dex.info ? prefecture.specialty : locked("？？？")),
        item("有名なもの", dex.info
          ? prefecture.famous.join("・")
          : locked("県名と県庁所在地の 両方に正解すると ひらくよ")),
        item("豆知識", dex.info ? prefecture.fact : locked("？？？"))
      ),

      el("div", { class: "panel panel--flat" },
        el("h3", { class: "panel__title" }, "この県の せいせき"),
        stats.attempts === 0
          ? el("p", {}, "まだ ちょうせんしていません。")
          : el("p", {},
              `${stats.attempts}回ちょうせん／正答率 ${Math.round(stats.accuracy * 100)}％`,
              el("br"),
              `習熟度 ${Math.round(stats.mastery * 100)}％`,
              stats.avgMs ? `／平均 ${(stats.avgMs / 1000).toFixed(1)}秒` : "")
      ),

      el("div", { class: "result-card__actions" },
        el("button", { class: "btn btn--lg", onClick: onClose }, "とじる"))
    )
  );
}

function item(label, value) {
  return el("div", { class: "dex-detail__row" },
    el("dt", {}, label),
    el("dd", {}, value)
  );
}

function filterButton(label, value, state, onChange) {
  return el("button", {
    class: "toggle",
    "aria-pressed": String(state.regionFilter === value),
    onClick: (event) => {
      state.regionFilter = value;
      for (const button of event.target.parentElement.querySelectorAll(".toggle")) {
        button.setAttribute("aria-pressed", String(button === event.target));
      }
      onChange();
    },
  }, label);
}
