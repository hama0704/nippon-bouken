/**
 * quiz-screen.js ― 問題画面。学習のいちばん中心になるところ。
 *
 * ■ 1問の流れ
 *   出題（地図の1県が光る）
 *     → マス目に手書き
 *     → 「こたえる」
 *     → 認識にかける
 *         自信がある  → そのまま採点して結果へ
 *         自信がない  → 自己確認（正解を見せて子どもが○△×を選ぶ）
 *     → 経験値・レベル・復習予定を更新
 *     → 結果を表示 → つぎの問題へ
 *
 * ■ この画面が持たない責任
 *   何を出すか（question-engine）、正しいかどうか（scoring-engine）、
 *   どれだけ成長するか（progress-engine）は、いずれも外にある。
 *   ここは「見せる」と「受け取る」に徹している。
 */

import { el, replace, clear, announce } from "../../utils/dom.js";
import { bus, Events } from "../../core/event-bus.js";
import { MapRenderer } from "../../map/map-renderer.js";
import { HandwritingPad } from "../components/handwriting-pad.js";
import { SelfCheckPanel } from "../components/self-check.js";
import { ResultPanel } from "./result-panel.js";

import { BattlePanel } from "../components/battle-panel.js";

import { QuestionEngine } from "../../engine/question-engine.js";
import { judgeAnswer, Judge } from "../../engine/scoring-engine.js";
import { applyAnswer } from "../../engine/progress-engine.js";
import { BattleEngine } from "../../engine/battle-engine.js";

import { SUBJECTS, findOtherSubject, prefectureOf } from "../../content/prefecture-pack.js";
import { PREFECTURES } from "../../content/prefectures.js";
import { encounterLine } from "../../content/enemies.js";
import { getRecognizer } from "../../platform/recognition/recognizer.js";

export function QuizScreen({ store, router, params }) {
  const mode = params.mode ?? store.session.mode ?? "name";
  const options = params.options ?? store.session.options ?? {};

  const battle = new BattleEngine(store);

  // 全国モードのときは、いま挑戦中の地方の県が出やすくなるようにする。
  // 「東北の鬼と戦いながら沖縄の問題が出る」というちぐはぐさを避け、
  // 地方ごとにまとめて覚えられるようにするため。
  const engine = new QuestionEngine({
    subjects: SUBJECTS,
    store,
    mode,
    options: { ...options, focusRegion: options.regionFilter ? null : battle.currentRegionId },
  });

  /* --- 画面の状態 -------------------------------------------------------- */
  const state = {
    question: null,
    hintLevel: 0,
    /** いま書こうとしている文字種。"kanji" | "kana" */
    script: options.writing === "kanji" ? "kanji" : "kanji",
    startedAt: 0,
    timerId: null,
    remaining: 0,
    /** 二重送信を防ぐ */
    submitting: false,
  };

  /* --- 部品 -------------------------------------------------------------- */
  const map = new MapRenderer({ interactive: false, showLabels: false });
  const battlePanel = new BattlePanel();
  const pad = new HandwritingPad({
    penWidth: store.settings.penWidth,
    onChange: () => { submitButton.disabled = !pad.hasInk; },
  });

  const questionText = el("span", {});
  const counter = el("span", {});
  const timerLabel = el("span", { class: "timer" });
  const hintList = el("div", { class: "hint-list" });
  const overlay = el("div", {});

  const scriptSwitch = buildScriptSwitch(state, () => {
    // 書く文字種を変えたら書き直してもらう（マスの意味が変わるため）
    pad.clear();
    announce(state.script === "kanji" ? "かんじで書きます" : "ひらがなで書きます");
  });

  const submitButton = el("button", {
    class: "btn btn--lg quiz-screen__submit",
    disabled: true,
    onClick: () => submit(),
  }, "こたえる");

  const hintButton = el("button", {
    class: "btn btn--sub",
    onClick: () => showNextHint(),
  }, "ヒント");

  // 分からない問題に「答えを見る」という出口を用意する。
  // 出口が無いと、子どもは当てずっぽうで書いて×をもらうか、
  // 手が止まってやめてしまう。どちらも学習にならない。
  const skipButton = el("button", {
    class: "btn btn--sub",
    onClick: () => skip(),
  }, "わからない");

  /* --- 画面の骨格 -------------------------------------------------------- */
  const root = el("div", { class: "screen quiz-screen" },
    el("header", { class: "topbar" },
      el("button", { class: "btn btn--sub", onClick: () => quit() }, "◀ やめる"),
      el("h2", { class: "topbar__title", "data-autofocus": "" }, "もんだい"),
      counter,
      el("div", { class: "topbar__spacer" }),
      timerLabel,
      el("span", {}, `Lv.${store.player.level}`)
    ),

    el("div", { class: "quiz-screen__body" },
      el("div", { class: "quiz-screen__left" },
        battlePanel.element,
        el("div", { class: "quiz-screen__map" }, map.element)
      ),

      el("div", { class: "quiz-screen__work" },
        el("div", { class: "quiz-screen__question" },
          questionText,
          options.writing === "kanji" ? null : scriptSwitch
        ),

        pad.element,

        el("div", { class: "quiz-screen__tools" },
          el("button", { class: "btn btn--sub", onClick: () => pad.undo() }, "一画 もどす"),
          el("button", { class: "btn btn--sub", onClick: () => pad.clear() }, "ぜんぶ けす"),
          hintButton,
          skipButton,
          submitButton
        ),

        el("div", { class: "quiz-screen__notes scrollable" }, hintList)
      )
    ),

    overlay
  );

  /* --- 出題 -------------------------------------------------------------- */

  function nextQuestion() {
    // 地方を制覇して冒険が進んだら、出題の重点もそちらへ移す
    if (!options.regionFilter) engine.setFocusRegion(battle.currentRegionId);

    const question = engine.next();
    if (!question) {
      showNoQuestions();
      return;
    }

    state.question = question;
    state.hintLevel = 0;
    state.startedAt = performance.now();
    state.submitting = false;

    clear(hintList);
    clear(overlay);
    pad.clear();
    hintButton.disabled = false;
    submitButton.disabled = true;

    // 地図：制覇ずみの地方は色を付け、答えの県だけを光らせる。
    // ラベルは出さない（名前が見えていたら問題にならない）。
    paintMap();
    map.setState(question.mapTargetId, "target");
    // 答えの県のまわりが、その2倍の広さまで見えるようにする。
    // 寄りすぎると「日本のどこか」が分からず、引きすぎると光っている県が見えない。
    // それでも足りなければ、指で動かすか「ぜんたい」ボタンで全体を見られる。
    map.focusOn(question.mapTargetId, 2);

    // 戦闘表示を最新にする
    if (battle.isGameCleared) battlePanel.hide();
    else if (battle.enemy) battlePanel.showEnemy(battle.enemy, battle.enemyHp, store.player);

    replace(questionText, question.questionText);
    replace(counter, `${engine.servedCount}もん目`);
    announce(question.questionText);

    startTimer();
  }

  /** 制覇した地方を地図の色に反映する（進んだ実感を地図で見せる） */
  function paintMap() {
    const cleared = store.battle.clearedRegions;
    for (const prefecture of PREFECTURES) {
      map.setState(prefecture.id,
        cleared.includes(prefecture.region) ? "cleared" : "locked");
    }
  }

  function showNoQuestions() {
    replace(overlay, el("div", { class: "result-layer" },
      el("div", { class: "result-card panel" },
        el("h2", {}, "出せる問題がありません"),
        el("p", {}, "モード選択で 地方のしぼりこみを ゆるめてみてね。"),
        el("button", { class: "btn btn--lg", onClick: () => router.back() }, "もどる")
      )
    ));
  }

  /* --- 制限時間 ---------------------------------------------------------- */

  function startTimer() {
    stopTimer();
    if (!options.timeLimit) {
      replace(timerLabel, "");
      return;
    }
    state.remaining = options.timeLimit;
    renderTimer();

    state.timerId = setInterval(() => {
      state.remaining--;
      renderTimer();
      if (state.remaining <= 0) {
        stopTimer();
        // 時間切れは「×」ではなく自己確認に回す。
        // 書いている途中で切れたときに一方的に×にすると理不尽に感じるため。
        announce("じかん切れ");
        submit({ timedOut: true });
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerId !== null) clearInterval(state.timerId);
    state.timerId = null;
  }

  function renderTimer() {
    replace(timerLabel, `のこり ${state.remaining}びょう`);
    timerLabel.classList.toggle("is-urgent", state.remaining <= 5);
  }

  /* --- ヒント ------------------------------------------------------------ */

  function showNextHint() {
    const question = state.question;
    if (!question) return;
    if (state.hintLevel >= question.hints.length) return;

    const hint = question.hints[state.hintLevel];
    state.hintLevel++;

    hintList.appendChild(el("div", { class: "hint-item" },
      el("div", { class: "hint-item__title" },
        `ヒント${hint.level}：${hint.title}`),
      el("div", {}, hint.text)
    ));
    announce(hint.text);

    if (state.hintLevel >= question.hints.length) hintButton.disabled = true;
  }

  /* --- 答え合わせ -------------------------------------------------------- */

  async function submit({ timedOut = false } = {}) {
    if (state.submitting || !state.question) return;
    state.submitting = true;
    stopTimer();

    const question = state.question;
    const elapsedMs = Math.round(performance.now() - state.startedAt);

    // 何も書いていない／時間切れ → 読み取りは試みず自己確認へ
    if (!pad.hasInk) {
      askSelfCheck(question, elapsedMs, { inkImage: null, guess: null, timedOut });
      return;
    }

    const inkImage = pad.toImage();
    let recognition = null;

    try {
      const recognizer = await getRecognizer(store.settings.recognizer);
      recognition = await recognizer.recognize({
        cells: pad.toCellInputs(),
        candidates: question.candidates[state.script],
      });
    } catch (error) {
      // 認識が落ちても学習は止めない。自己確認に切り替える。
      console.warn("[ocr] 認識に失敗しました:", error);
    }

    if (!recognition || recognition.needsConfirmation) {
      askSelfCheck(question, elapsedMs, {
        inkImage,
        guess: recognition?.text || null,
        timedOut,
      });
      return;
    }

    const judgement = judgeAnswer(recognition.text, question.answer, {
      findOther: (text) => findOtherSubject(text, question.subjectId),
      requireSuffix: store.settings.requireSuffix,
    });
    finish(question, judgement, elapsedMs);
  }

  /**
   * 「わからない」を押したとき。
   *
   * ■ 罰にしない
   *   答えを見たことを重く罰すると、子どもは当てずっぽうを書くようになる。
   *   知らないことを「知らない」と言えるほうが、学習としてはずっと良い。
   *   経験値は0だが、敵の反撃は受けない。
   *
   * ■ ただし、ただ飛ばすだけにもしない
   *   記録の上では「まちがえた」と同じ扱いにして、明日また出るようにする。
   *   次にその県を正解すると「まちがい直し」の120経験値がつくので、
   *   分からなかった県に戻ってくる動機になる。
   */
  function skip() {
    if (state.submitting || !state.question) return;
    state.submitting = true;
    stopTimer();

    const question = state.question;
    const elapsedMs = Math.round(performance.now() - state.startedAt);

    finish(question, {
      judge: Judge.BATSU,
      reason: "skipped",
      message: "こたえを 見てみよう。つぎに 正解できたら 大きなけいけんちが もらえるよ！",
      wroteSuffix: false,
      // 記録上は「まちがえた」と同じでも、見せ方は責めない形にする
      view: { mark: "？", label: "こたえを 見た", className: "judge--sankaku" },
    }, elapsedMs, { skipped: true });
  }

  /** 認識に頼らず、子ども自身に○△×を選んでもらう */
  function askSelfCheck(question, elapsedMs, { inkImage, guess, timedOut }) {
    replace(overlay, el("div", { class: "result-layer" },
      el("div", { class: "result-card panel" },
        timedOut && el("p", { class: "result-card__message" }, "じかん切れ！"),
        SelfCheckPanel({
          answer: question.answer,
          inkImage,
          guess,
          requireSuffix: store.settings.requireSuffix,
          // 自己採点では機械が読んでいないので、「県まで書けたか」も
          // 子ども自身に答えてもらう（○のボタンが完全形になっている）
          onChoose: (judge, wroteSuffix) => {
            const judgement = {
              judge,
              reason: "selfcheck",
              message: selfCheckMessage(judge),
              wroteSuffix,
            };
            finish(question, judgement, elapsedMs);
          },
        })
      )
    ));
  }

  /** 採点結果を記録して、結果画面を出す */
  function finish(question, judgement, elapsedMs, { skipped = false } = {}) {
    bus.emit(Events.ANSWER_JUDGED, { question, judgement });

    // 順番が大事: 先に経験値とレベルを確定させてから戦闘に反映する。
    // レベルアップ直後の攻撃力で殴れるようにするため。
    const reward = applyAnswer({
      store,
      question,
      judge: judgement.judge,
      hintLevel: state.hintLevel,
      elapsedMs,
      wroteSuffix: judgement.wroteSuffix ?? false,
      skipped,
    });

    // 「わからない」を選んだときは敵の反撃を受けない。
    // 正直に言えたことで痛い目にあうなら、次からは当てずっぽうを書くようになる。
    const outcome = skipped ? { skipped: true } : battle.resolve(judgement.judge);

    const panel = ResultPanel({
      question,
      judgement,
      reward,
      battle: outcome,
      store,
      prefecture: prefectureOf(question.subjectId),
      onNext: () => {
        if (outcome.gameCleared) showVictory();
        else nextQuestion();
      },
      onQuit: () => quit(),
    });

    replace(overlay, panel.element);
    panel.play();
  }

  /** 魔王を倒したときの全国制覇画面 */
  function showVictory() {
    map.resetStates("cleared");
    map.resetZoom();

    replace(overlay, el("div", { class: "victory-layer" },
      el("div", {},
        el("h1", { "data-autofocus": "" }, "全国制覇！"),
        el("p", { class: "result-card__message" },
          "47都道府県すべてを 味方につけ、魔王をたおした！"),
        el("p", {}, `レベル ${store.player.level}　${store.stats.totalQuestions}問 クリア`),
        el("p", { class: "result-card__reading" },
          "ここからは 苦手な県の ふくしゅうに ちょうせんしよう。"),
        el("div", { class: "result-card__actions" },
          el("button", { class: "btn btn--lg", onClick: () => nextQuestion() }, "つづける"),
          el("button", { class: "btn btn--sub", onClick: () => quit() }, "やめる")
        )
      )
    ));
    announce("全国制覇！魔王をたおしました");
  }

  function quit() {
    stopTimer();
    store.flush();
    router.back();
  }

  /* --- 起動 -------------------------------------------------------------- */

  // 認識エンジンのお手本づくりを先に始めておく。
  // 1問目の「こたえる」で待たされないようにするための先読み。
  getRecognizer(store.settings.recognizer).catch(() => {});

  nextQuestion();
  if (battle.enemy) announce(encounterLine(battle.enemy));

  return {
    root,
    destroy() {
      stopTimer();
      pad.destroy();
      store.flush();
    },
  };
}

/* ---------------------------------------------------------------------------
 * 小さな部品
 * ------------------------------------------------------------------------- */

/**
 * かんじ／ひらがなの切り替え。
 * 「ひらがなだと△になる」ことを先に見せておくと、
 * 子どもは自分で「今日は漢字に挑戦しよう」と決められる。
 */
function buildScriptSwitch(state, onChange) {
  const make = (value, label) => el("button", {
    class: "script-switch__btn",
    "aria-pressed": String(state.script === value),
    onClick: () => {
      if (state.script === value) return;
      state.script = value;
      for (const button of buttons) {
        button.setAttribute("aria-pressed", String(button.dataset.value === state.script));
      }
      onChange();
    },
    dataset: { value },
  }, label);

  const buttons = [make("kanji", "かんじ ○"), make("kana", "ひらがな △")];
  return el("div", { class: "script-switch", role: "group", "aria-label": "書きかた" }, ...buttons);
}

function selfCheckMessage(judge) {
  if (judge === Judge.MARU) return "よくできました！じぶんで丸つけできたね。";
  if (judge === Judge.SANKAKU) return "おしい！つぎは かんじで書いてみよう。";
  return "だいじょうぶ。もういちど おぼえよう！";
}
