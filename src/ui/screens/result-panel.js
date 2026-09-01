/**
 * result-panel.js ― 1問ぶんの結果表示。
 *
 * 問題画面の上に全画面でかぶせる。別画面にしないのは、
 * 出題キュー（次に何を出すか）を持ったまま「つぎへ」で戻りたいから。
 *
 * ■ 見せる順番にこだわる理由
 *   ○△× → 正解 → 経験値 → レベルアップ、と1つずつ間を置いて出す。
 *   全部同時に出すと、子どもは経験値の数字しか見ない。
 *   「正解はこれだった」を目に入れてから報酬を出すことで、
 *   ごほうびが学習内容と結びつく。
 */

import { el, announce, wait } from "../../utils/dom.js";
import { answerRuby, fullReading } from "../components/answer-text.js";
import { JUDGE_VIEW, Judge } from "../../engine/scoring-engine.js";
import { levelProgress } from "../../engine/progress-engine.js";
import { createEnemyArt } from "../components/enemy-art.js";
import { encounterLine } from "../../content/enemies.js";

/**
 * @param {object} options
 * @param {object} options.question
 * @param {object} options.judgement  scoring-engine の戻り値
 * @param {object} options.reward     progress-engine の戻り値
 * @param {object} options.store
 * @param {object} options.prefecture 表示用の都道府県データ
 * @param {() => void} options.onNext
 * @param {() => void} options.onQuit
 * @returns {{ element: HTMLElement, play: () => Promise<void> }}
 */
export function ResultPanel({ question, judgement, reward, battle, store, prefecture, onNext, onQuit }) {
  // 「わからない」を選んだときなど、判定は同じでも見せ方を変えたい場合がある。
  // 正直に答えを見にいったことを「ざんねん…」と言われると、次から使わなくなる。
  const view = { ...JUDGE_VIEW[judgement.judge], ...(judgement.view ?? {}) };
  const answer = question.answer;
  const fullAnswer = answer.kanji + answer.suffix;

  // 演出中に順番に見せていく部分は、最初は空にしておく
  const expArea = el("div", { class: "result-card__exp" });
  const bonusArea = el("div", {});
  const battleArea = el("div", { class: "result-card__exp" });

  const element = el("div", { class: "result-layer", role: "dialog", "aria-label": "こたえあわせ" },
    el("div", { class: "result-card panel" },

      // ① 判定（色・形・文字の3つで伝える）
      el("div", { class: `judge ${view.className}`, "data-autofocus": "" },
        el("div", { class: "judge__mark", "aria-hidden": "true" }, view.mark),
        el("div", { class: "judge__text" }, view.label)
      ),

      // ② 正解（本体と接尾辞に別々にふりがなを振る）
      el("div", {},
        el("p", { class: "result-card__answer" }, answerRuby(answer)),
        el("p", { class: "result-card__reading" },
          question.part === "capital"
            ? `${prefecture.name}${prefecture.suffix} の 県庁所在地　よみ：${fullReading(answer)}`
            : `よみ：${fullReading(answer)}`)
      ),

      el("p", { class: "result-card__message" }, judgement.message),

      // ③ 経験値（少し遅れて出す）
      expArea,
      bonusArea,

      // ④ 戦闘の結果
      battleArea,

      // ⑤ 次へ
      el("div", { class: "result-card__actions" },
        el("button", { class: "btn btn--lg", onClick: onNext },
          battle?.gameCleared ? "けっかを 見る ▶" : "つぎの もんだい ▶"),
        el("button", { class: "btn btn--sub", onClick: onQuit }, "やめる")
      )
    )
  );

  /** 演出を順番に再生する */
  async function play() {
    // 読み上げ環境にも同じ情報を届ける
    announce(`${view.label} 正解は ${fullAnswer}。${judgement.message}`);

    await wait(600);

    if (reward.exp > 0) {
      expArea.appendChild(el("div", { class: "exp-gain" }, `けいけんち ＋${reward.exp}`));
      expArea.appendChild(el("div", { class: "exp-reasons" },
        reward.reasons.map((reason) => el("span", {}, `・${reason}`))));
      expArea.appendChild(expBar(store, reward));
    } else {
      expArea.appendChild(el("div", { class: "exp-reasons" },
        reward.reasons.map((reason) => el("span", {}, `・${reason}`))));
    }

    if (reward.overcame && judgement.judge !== Judge.BATSU) {
      await wait(400);
      bonusArea.appendChild(el("div", { class: "levelup-banner" }, "にがて克服！"));
    }

    if (reward.leveledUp) {
      await wait(500);
      const stats = reward.gainedStats;
      bonusArea.appendChild(el("div", { class: "levelup-banner" },
        `レベルアップ！ Lv.${reward.level}`));
      bonusArea.appendChild(el("p", { class: "result-card__reading" },
        `さいだいHP+${stats.maxHp}／こうげき+${stats.atk}／` +
        `しゅび+${stats.def}／すばやさ+${stats.spd}`));
      announce(`レベルアップ！ レベル ${reward.level} になりました`);
    }

    await playBattle();
  }

  /**
   * 戦闘の結果を順に見せる。
   * 「攻撃 → 撃破 → 地方制覇」と1つずつ間を置くことで、
   * 何が起きたのかを子どもが追える速さにしている。
   */
  async function playBattle() {
    if (!battle || battle.skipped) return;

    if (battle.damage > 0) {
      await wait(400);
      battleArea.appendChild(el("div", { class: "exp-gain" },
        `こうげき！ ${battle.enemy.name} に ${battle.damage} ダメージ`));
      if (battle.healed > 0) {
        battleArea.appendChild(el("div", { class: "exp-reasons" },
          el("span", {}, `・HPが ${battle.healed} かいふくした`)));
      }
    }

    if (battle.counterDamage > 0) {
      await wait(400);
      battleArea.appendChild(el("div", { class: "battle-banner battle-banner--down" },
        `${battle.enemy.name} の こうげき！ ${battle.counterDamage} ダメージ`));
    }

    if (battle.playerDown) {
      await wait(400);
      battleArea.appendChild(el("div", { class: "battle-banner battle-banner--down" },
        "たおれてしまった… でも HPが ぜんかいふく！ もういちど ちょうせんだ"));
      announce("たおれてしまいましたが、HPが全回復しました");
    }

    if (battle.enemyDefeated) {
      await wait(500);
      battleArea.appendChild(el("div", { class: "battle-banner" },
        `${battle.enemy.name} を たおした！`));
      announce(`${battle.enemy.name} を たおしました`);
    }

    if (battle.regionCleared) {
      await wait(600);
      battleArea.appendChild(el("div", { class: "battle-banner battle-banner--region" },
        `${battle.regionCleared.name}地方 せいは！`));
      battleArea.appendChild(el("p", { class: "result-card__reading" },
        "地図の その地方に 色がつき、HPが ぜんかいふくした！"));
      announce(`${battle.regionCleared.name}地方を制覇しました`);
    }

    // 次の敵の予告。誰と戦うのかを先に見せておくと、次の問題に向かう気持ちが続く
    if (battle.nextEnemy && !battle.gameCleared) {
      await wait(500);
      battleArea.appendChild(el("div", { class: "result-next-enemy" },
        createEnemyArt(battle.nextEnemy, { size: 80 }),
        el("span", {}, encounterLine(battle.nextEnemy))
      ));
    }
  }

  return { element, play };
}

/**
 * 経験値バー。
 * もらう前の位置から描きはじめ、少し遅れて今の位置へ伸ばす。
 * こうすると「どれだけ増えたか」が動きで伝わる。
 *
 * 幅の変更に setTimeout を使っているのは、requestAnimationFrame が
 * 画面を描いていないとき（別アプリを開いている間など）に呼ばれず、
 * バーが 0% のまま止まってしまうため。
 */
function expBar(store, reward) {
  const progress = levelProgress(store.player);
  const toPercent = Math.round(progress.ratio * 100);

  // レベルアップした場合は、いったん空から伸ばす（前の値は別レベルのもの）
  const fromPercent = reward.leveledUp
    ? 0
    : Math.max(0, Math.round(((progress.current - reward.exp) / progress.needed) * 100));

  const fill = el("div", { class: "bar__fill", style: { width: `${fromPercent}%` } });
  setTimeout(() => { fill.style.width = `${toPercent}%`; }, 60);

  return el("div", {},
    el("div", { class: "bar" },
      fill,
      el("span", { class: "bar__label" },
        `Lv.${store.player.level}　${progress.current} / ${progress.needed}`)
    )
  );
}
