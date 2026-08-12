/**
 * question-engine.js ― 「次に何を出すか」を決める。
 *
 * ■ ただのランダムにしない理由
 *   47問を等確率で出すと、できる県ばかり何度も出て、
 *   苦手な県はいつまでも出てこない。
 *   そこで「まだ解いていない」「間違えた」「そろそろ忘れるころ」の
 *   3つを重みにして、覚えるべき問題が自然に多く出るようにしている。
 *
 * ■ 教材への非依存
 *   このエンジンは Subject（出題対象）の配列を受け取るだけで、
 *   都道府県かどうかを知らない。
 *   世界地図や歴史人物のパックを渡せばそのまま動く。
 */

import { pickWeighted } from "../utils/random.js";
import { acceptedForms } from "../utils/kana.js";
import { isDue } from "./srs-engine.js";

/** 出題の重み。数字が大きいほど出やすい */
const WEIGHTS = {
  neverAnswered: 3.0,   // まだ一度も解いていない
  lastWrong:     4.0,   // 直前に間違えた
  weak:          2.5,   // 正答率が低い
  normal:        1.0,
  mastered:      0.35,  // 連続で正解できている
};

/** 直前に出した問題を何問ぶん避けるか（同じ県が続くと飽きる） */
const RECENT_MEMORY = 6;

/** 冒険中の地方の県が、どれだけ出やすくなるか */
const FOCUS_BOOST = 3;

export class QuestionEngine {
  #subjects;      // 出題対象の一覧（フィルタ済み）
  #store;
  #mode;          // "name" | "capital" | "both"
  #options;
  #recent = [];   // 直近に出した subject id
  #pending = [];  // 「そうごうモード」で続けて出す予約
  #served = 0;

  /**
   * @param {object} config
   * @param {Array} config.subjects   { id, answers, meta } を持つ出題対象の配列
   * @param {object} config.store
   * @param {string} config.mode
   * @param {object} config.options   モード選択画面で決めた設定
   */
  constructor({ subjects, store, mode, options }) {
    this.#store = store;
    this.#mode = mode;
    this.#options = options ?? {};
    this.#subjects = this.#applyFilters(subjects);
  }

  /**
   * 重点的に出す地方を変える。
   * 冒険が次の地方へ進んだら呼ぶこと。呼ばないと、制覇ずみの地方の問題が
   * 出つづけてしまう。
   */
  setFocusRegion(regionId) {
    this.#options = { ...this.#options, focusRegion: regionId };
  }

  /** 出題できる対象があるか */
  get isEmpty() { return this.#subjects.length === 0; }
  /** これまでに出した問題数 */
  get servedCount() { return this.#served; }

  /**
   * 次の問題を1問返す。
   * @returns {object|null} 出題できるものが無ければ null
   */
  next() {
    // そうごうモードで「県名の次は県庁所在地」を予約してある場合
    if (this.#pending.length > 0) {
      const question = this.#pending.shift();
      this.#served++;
      return question;
    }
    if (this.#subjects.length === 0) return null;

    const subject = this.#pickSubject();
    this.#remember(subject.id);

    if (this.#mode === "both") {
      // 同じ県について「県名 → 県庁所在地」を続けて出す
      const [first, second] = ["name", "capital"].map((part) =>
        this.#buildQuestion(subject, part));
      this.#pending.push(second);
      this.#served++;
      return first;
    }

    this.#served++;
    return this.#buildQuestion(subject, this.#mode);
  }

  /* --- 対象の絞り込み ---------------------------------------------------- */

  #applyFilters(subjects) {
    let pool = subjects;

    // 地方しぼり
    if (this.#options.regionFilter) {
      pool = pool.filter((s) => s.meta.region === this.#options.regionFilter);
    }

    // 復習モード: 「間違えたもの」に加えて「そろそろ忘れるころのもの」も出す。
    // 間違えた県だけに絞ると、一度で覚えた県が二度と出てこなくなり、
    // かえって忘れてしまう。忘却曲線の期日が来たものを混ぜることで、
    // 覚えたはずの県も定着させる。
    if (this.#options.reviewOnly) {
      const targets = pool.filter((subject) => {
        const record = this.#store.progressOf(subject.id);
        return isWeak(record) || (record.answered > 0 && isDue(record));
      });
      // 1件も無いのは「よく覚えている」という良い状態なので、止めずに全体へ戻す
      if (targets.length > 0) pool = targets;
    }

    return pool;
  }

  /* --- 選び方 ------------------------------------------------------------ */

  #pickSubject() {
    // 直近に出したものは候補から外す。ただし候補が尽きるなら外さない。
    const fresh = this.#subjects.filter((s) => !this.#recent.includes(s.id));
    const pool = fresh.length > 0 ? fresh : this.#subjects;

    // いま冒険中の地方を重点的に出す（全国モードでも旅の流れを保つため）。
    // 完全に絞り込まないのは、前の地方を忘れさせないため。
    const focus = this.#options.focusRegion;
    const weights = pool.map((subject) => {
      const weight = weightOf(this.#store.progressOf(subject.id), this.#mode);
      return focus && subject.meta.region === focus ? weight * FOCUS_BOOST : weight;
    });
    return pickWeighted(pool, weights);
  }

  #remember(subjectId) {
    this.#recent.push(subjectId);
    if (this.#recent.length > RECENT_MEMORY) this.#recent.shift();
  }

  /* --- 問題の組み立て ---------------------------------------------------- */

  /**
   * Subject と出題パートから、画面と採点に必要な情報を1つにまとめる。
   * 認識エンジンに渡す候補（candidates）もここで作る。
   */
  #buildQuestion(subject, part) {
    const answer = subject.answers[part];

    return {
      id: `${subject.id}:${part}`,
      subjectId: subject.id,
      part,
      questionText: part === "capital"
        ? "光っている県の 県庁所在地を 書こう"
        : "光っている県の 名前を 書こう",
      answer,
      // 認識は「この中のどれか」を選ぶ問題として解く。
      // 候補が絞れているほど精度が上がるので、漢字とひらがなも分けて渡し、
      // 画面側で「いま子どもが書こうとしている方」だけを使う。
      candidates: buildCandidates(this.#subjects, part),
      hints: buildHints(subject, part),
      mapTargetId: subject.id,
    };
  }
}

/* ---------------------------------------------------------------------------
 * 重みづけ
 * ------------------------------------------------------------------------- */

/** その対象が「苦手」か */
export function isWeak(record) {
  const wrong = record.nameWrong + record.capWrong;
  const correct = record.nameCorrect + record.capCorrect;
  if (wrong === 0) return false;
  return record.lastJudge !== "maru" || wrong >= correct;
}

/**
 * 出題の重みを決める。
 * 忘却曲線で「そろそろ出すべき」と判定されたものは倍にする。
 */
export function weightOf(record, mode, now = Date.now()) {
  const correct = mode === "capital" ? record.capCorrect : record.nameCorrect;
  const wrong   = mode === "capital" ? record.capWrong   : record.nameWrong;

  let weight;
  if (correct === 0 && wrong === 0)      weight = WEIGHTS.neverAnswered;
  else if (record.lastJudge === "batsu") weight = WEIGHTS.lastWrong;
  else if (wrong >= correct)             weight = WEIGHTS.weak;
  else if (record.streak >= 3)           weight = WEIGHTS.mastered;
  else                                   weight = WEIGHTS.normal;

  // 復習の期日が来ているものを優先する
  if (record.nextDueAt > 0 && now >= record.nextDueAt) weight *= 2;

  return weight;
}

/* ---------------------------------------------------------------------------
 * 認識の候補づくり
 * ------------------------------------------------------------------------- */

/**
 * 認識エンジンに渡す「ありうる答え」の一覧を作る。
 *
 * 子どもは「神奈川」とも「神奈川県」とも書くので、両方を候補に入れる。
 * 認めるかたちの定義は採点と同じ acceptedForms を使う。
 * ここで別々に組み立てると、「認識はできたのに採点で×になる」という
 * いちばん理不尽な不具合が起きる。
 *
 * 漢字とひらがなを別のリストにしているのは、認識の精度のため。
 * 「いまはひらがなで書く」と分かっていれば候補が半分になり、
 * 漢字とかなを取り違える事故もなくなる。
 *
 * @returns {{ kanji: string[], kana: string[] }}
 */
export function buildCandidates(subjects, part) {
  const kanji = new Set();
  const kana = new Set();

  for (const subject of subjects) {
    const answer = subject.answers[part];
    if (!answer) continue;
    const forms = acceptedForms(answer);
    for (const form of forms.kanji) kanji.add(form);
    for (const form of forms.kana) kana.add(form);
  }
  return { kanji: [...kanji], kana: [...kana] };
}

/* ---------------------------------------------------------------------------
 * ヒント
 * ------------------------------------------------------------------------- */

/**
 * 3段階のヒントを作る。
 *   1段階目: 地方（範囲をしぼる）
 *   2段階目: 最初の1文字（思い出すきっかけ）
 *   3段階目: 文字数と形（ほぼ答えだが、書く練習にはなる）
 * 使うほど経験値が減る仕組みは progress-engine 側で扱う。
 */
export function buildHints(subject, part) {
  const answer = subject.answers[part];
  const chars = [...answer.kanji];

  return [
    {
      level: 1,
      title: "地方のヒント",
      text: `この県は「${subject.meta.regionName}地方」にあるよ。`,
    },
    {
      level: 2,
      title: "さいしょの文字",
      text: `「${chars[0]}」からはじまるよ。よみは「${answer.kana[0]}…」。`,
    },
    {
      level: 3,
      title: "かたち",
      text: `${chars.length}文字で「${chars[0]}${"○".repeat(chars.length - 1)}」。` +
            `よみは「${answer.kana}」。`,
    },
  ];
}
