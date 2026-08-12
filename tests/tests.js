/**
 * tests.js ― ロジックの回帰テスト。
 *
 * 対象は「壊れたら気づきにくく、壊れると学習に直接ひびく」ところ。
 *   ・採点のきまり（○△×）
 *   ・経験値と忘却曲線の計算
 *   ・地図データの整合性
 *   ・セーブの読み書きと復旧
 * 画面の見た目はここでは扱わない（docs/TESTING.md の手動チェックで見る）。
 */

import { describe, it, expect } from "./test-runner.js";

import {
  toHiragana, toKatakana, normalize, acceptedForms,
  editDistance, isAllHiragana, containsKanji, maskAnswer,
} from "../src/utils/kana.js";
import { judgeAnswer, Judge } from "../src/engine/scoring-engine.js";
import { calculateExp, expToNextLevel, EXP_TABLE, HINT_PENALTY } from "../src/engine/progress-engine.js";
import { nextSchedule, isDue, INTERVALS_DAYS } from "../src/engine/srs-engine.js";
import { buildCandidates, weightOf, isWeak } from "../src/engine/question-engine.js";
import { masteryOf } from "../src/engine/analytics-engine.js";
import { PREFECTURES, PREFECTURE_IDS, PREFECTURE_BY_ID } from "../src/content/prefectures.js";
import { validateShapes, cellsOf, GRID_COLS, GRID_ROWS } from "../src/content/pref-shapes.js";
import { cellsToPath, labelLayout } from "../src/map/shape-builder.js";
import { SUBJECTS, findOtherSubject } from "../src/content/prefecture-pack.js";
import { ENEMIES_BY_REGION, ALL_ENEMIES, DEMON_LORD } from "../src/content/enemies.js";
import { REGIONS } from "../src/content/regions.js";
import { createNewSave, createProgressEntry, SAVE_VERSION } from "../src/core/save-manager.js";
import { countDayStreak, toDateKey } from "../src/core/store.js";
import { setSeed, pickWeighted, shuffle } from "../src/utils/random.js";

const DAY = 24 * 60 * 60 * 1000;

/* =========================================================================
 * かな処理
 * ======================================================================= */
describe("kana ― 文字列をそろえる", () => {
  it("カタカナをひらがなにする", () => {
    expect(toHiragana("カナガワ")).toBe("かながわ");
    expect(toHiragana("ホッカイドウ")).toBe("ほっかいどう");
  });

  it("ひらがなをカタカナにする", () => {
    expect(toKatakana("かながわ")).toBe("カナガワ");
  });

  it("空白を取り除く", () => {
    expect(normalize(" かな　がわ ")).toBe("かながわ");
  });

  it("長音符を前の音の母音に開く（取り除かない）", () => {
    expect(normalize("とーきょー")).toBe("とうきょう");
    expect(toHiragana(normalize("トーキョー"))).toBe("とうきょう");
    expect(normalize("さっぽろ")).toBe("さっぽろ");
  });

  it("全角英数を標準形にする", () => {
    expect(normalize("１２３")).toBe("123");
  });

  it("正解として認める形を、答えのデータから組み立てる", () => {
    const kanagawa = acceptedForms({ kanji: "神奈川", kana: "かながわ", suffix: "県" });
    expect(kanagawa.kanji).toEqual(["神奈川", "神奈川県"]);
    expect(kanagawa.kana).toEqual(["かながわ", "かながわけん"]);
  });

  it("接尾辞が無い答えでは、余計な形を作らない", () => {
    const hokkaido = acceptedForms({ kanji: "北海道", kana: "ほっかいどう", suffix: "" });
    expect(hokkaido.kanji).toEqual(["北海道"]);
    expect(hokkaido.kana).toEqual(["ほっかいどう"]);
  });

  it("名前の一部である「都」「府」を接尾辞と取りちがえない", () => {
    // 末尾一致で削る実装だと「京都」→「京」、「甲府」→「甲」になって壊れる
    const kyoto = acceptedForms({ kanji: "京都", kana: "きょうと", suffix: "府" });
    expect(kyoto.kanji).toContain("京都");
    expect(kyoto.kana).toContain("きょうと");
    const kofu = acceptedForms({ kanji: "甲府", kana: "こうふ", suffix: "市" });
    expect(kofu.kanji).toContain("甲府");
    expect(kofu.kana).toContain("こうふ");
  });

  it("編集距離を数える", () => {
    expect(editDistance("埼玉", "崎玉")).toBe(1);
    expect(editDistance("神奈川", "神奈川")).toBe(0);
    expect(editDistance("千葉", "埼玉")).toBe(2);
  });

  it("ひらがな・漢字を判別する", () => {
    expect(isAllHiragana("さいたま")).toBeTruthy();
    expect(isAllHiragana("埼玉")).toBeFalsy();
    expect(containsKanji("神な川")).toBeTruthy();
    expect(containsKanji("かながわ")).toBeFalsy();
  });

  it("答えを一部だけ見せる", () => {
    expect(maskAnswer("神奈川", 1)).toBe("神○○");
    expect(maskAnswer("鹿児島", 2)).toBe("鹿児○");
  });
});

/* =========================================================================
 * 採点 ― 先生に指定いただいたきまりをそのまま検証する
 * ======================================================================= */
describe("scoring ― ○△×のきまり", () => {
  const saitama = { kanji: "埼玉", kana: "さいたま", suffix: "県" };
  const kanagawa = { kanji: "神奈川", kana: "かながわ", suffix: "県" };
  const hokkaido = { kanji: "北海道", kana: "ほっかいどう", suffix: "" };
  const saitamaCity = { kanji: "さいたま", kana: "さいたま", suffix: "市" };
  const other = (id) => ({ findOther: (text) => findOtherSubject(text, id) });

  it("漢字で正しければ ○", () => {
    expect(judgeAnswer("埼玉", saitama).judge).toBe(Judge.MARU);
  });

  it("「県」は付いていてもいなくても ○", () => {
    expect(judgeAnswer("埼玉県", saitama).judge).toBe(Judge.MARU);
  });

  it("ひらがなは △", () => {
    expect(judgeAnswer("さいたま", saitama).judge).toBe(Judge.SANKAKU);
    expect(judgeAnswer("さいたまけん", saitama).judge).toBe(Judge.SANKAKU);
  });

  it("カタカナも読みが合っていれば △", () => {
    expect(judgeAnswer("サイタマ", saitama).judge).toBe(Judge.SANKAKU);
  });

  it("漢字が1文字ちがえば × だが「おしい」と伝える", () => {
    const result = judgeAnswer("崎玉", saitama);
    expect(result.judge).toBe(Judge.BATSU);
    expect(result.reason).toBe("kanji-wrong");
    expect(result.message).toContain("おしい");
  });

  it("漢字とかなが混ざっていたら △（送り仮名ちがい扱い）", () => {
    expect(judgeAnswer("神な川", kanagawa).judge).toBe(Judge.SANKAKU);
  });

  it("別の県を書いたら × で、どの県かを伝える", () => {
    const result = judgeAnswer("千葉", saitama, other(11));
    expect(result.judge).toBe(Judge.BATSU);
    expect(result.message).toContain("千葉県");
  });

  it("何も書かれていなければ ×", () => {
    expect(judgeAnswer("", saitama).judge).toBe(Judge.BATSU);
  });

  it("北海道は「道」を落とさずに ○", () => {
    expect(judgeAnswer("北海道", hokkaido).judge).toBe(Judge.MARU);
    expect(judgeAnswer("ほっかいどう", hokkaido).judge).toBe(Judge.SANKAKU);
  });

  it("京都・甲府など、名前が接尾辞で終わる県でも ○ になる", () => {
    const kyoto = { kanji: "京都", kana: "きょうと", suffix: "府" };
    expect(judgeAnswer("京都", kyoto).judge).toBe(Judge.MARU);
    expect(judgeAnswer("京都府", kyoto).judge).toBe(Judge.MARU);
    expect(judgeAnswer("きょうと", kyoto).judge).toBe(Judge.SANKAKU);

    const kofu = { kanji: "甲府", kana: "こうふ", suffix: "市" };
    expect(judgeAnswer("甲府", kofu).judge).toBe(Judge.MARU);
    expect(judgeAnswer("甲府市", kofu).judge).toBe(Judge.MARU);
    expect(judgeAnswer("こうふ", kofu).judge).toBe(Judge.SANKAKU);

    const mito = { kanji: "水戸", kana: "みと", suffix: "市" };
    expect(judgeAnswer("みと", mito).judge).toBe(Judge.SANKAKU);
  });

  it("答えそのものがひらがなの県庁所在地は ○ になる", () => {
    expect(judgeAnswer("さいたま", saitamaCity).judge).toBe(Judge.MARU);
    expect(judgeAnswer("さいたま市", saitamaCity).judge).toBe(Judge.MARU);
  });

  it("47県すべてで、正しい漢字は ○ になる", () => {
    for (const subject of SUBJECTS) {
      const answer = subject.answers.name;
      const result = judgeAnswer(answer.kanji, answer, other(subject.id));
      expect(result.judge).toBe(Judge.MARU);
    }
  });

  it("47県すべてで、正しい読みは ○ か △ になる（× にならない）", () => {
    for (const subject of SUBJECTS) {
      const answer = subject.answers.name;
      const result = judgeAnswer(answer.kana, answer, other(subject.id));
      expect(result.judge === Judge.MARU || result.judge === Judge.SANKAKU).toBeTruthy();
    }
  });

  it("47県すべての県庁所在地でも同じことが成り立つ", () => {
    for (const subject of SUBJECTS) {
      const answer = subject.answers.capital;
      expect(judgeAnswer(answer.kanji, answer, other(subject.id)).judge).toBe(Judge.MARU);
      const kanaJudge = judgeAnswer(answer.kana, answer, other(subject.id)).judge;
      expect(kanaJudge === Judge.MARU || kanaJudge === Judge.SANKAKU).toBeTruthy();
    }
  });
});

/* =========================================================================
 * 経験値
 * ======================================================================= */
describe("progress ― 経験値のきまり", () => {
  const fresh = { correct: 0, kana: 0, wrong: 0, lastJudge: null };

  it("はじめて漢字で正解 → 100", () => {
    expect(calculateExp({ judge: Judge.MARU, before: fresh }).exp).toBe(EXP_TABLE.firstKanji);
  });

  it("はじめてひらがなで正解 → 60", () => {
    expect(calculateExp({ judge: Judge.SANKAKU, before: fresh }).exp).toBe(EXP_TABLE.firstKana);
  });

  it("2回目の正解 → 50", () => {
    const before = { correct: 1, kana: 0, wrong: 0, lastJudge: Judge.MARU };
    expect(calculateExp({ judge: Judge.MARU, before }).exp).toBe(EXP_TABLE.secondKanji);
  });

  it("3回目以降の正解 → 20", () => {
    const before = { correct: 2, kana: 0, wrong: 0, lastJudge: Judge.MARU };
    expect(calculateExp({ judge: Judge.MARU, before }).exp).toBe(EXP_TABLE.repeatKanji);
  });

  it("前回まちがえた問題に正解 → 120（いちばん多い）", () => {
    const before = { correct: 3, kana: 0, wrong: 1, lastJudge: Judge.BATSU };
    const result = calculateExp({ judge: Judge.MARU, before });
    // 苦手克服ボーナスが付かない条件（まちがい1回）で確認する
    expect(result.exp).toBe(EXP_TABLE.comeback);
  });

  it("まちがえたら 0", () => {
    expect(calculateExp({ judge: Judge.BATSU, before: fresh }).exp).toBe(0);
  });

  it("何度もまちがえた県に正解すると苦手克服ボーナスがつく", () => {
    const before = { correct: 0, kana: 0, wrong: 4, lastJudge: Judge.BATSU };
    const result = calculateExp({ judge: Judge.MARU, before });
    expect(result.overcame).toBeTruthy();
    expect(result.exp).toBe(EXP_TABLE.comeback + 4 * 20);
  });

  it("ヒントを使うと減る", () => {
    const full = calculateExp({ judge: Judge.MARU, hintLevel: 0, before: fresh }).exp;
    const withHint = calculateExp({ judge: Judge.MARU, hintLevel: 3, before: fresh }).exp;
    expect(withHint).toBe(Math.round(full * HINT_PENALTY[3]));
  });

  it("次のレベルに必要な経験値はレベルとともに増える", () => {
    expect(expToNextLevel(1)).toBe(120);
    expect(expToNextLevel(2)).toBe(200);
    expect(expToNextLevel(5) > expToNextLevel(4)).toBeTruthy();
  });
});

/* =========================================================================
 * 忘却曲線
 * ======================================================================= */
describe("srs ― 復習の間隔", () => {
  const now = Date.UTC(2026, 7, 4);

  it("段階は 翌日・3日後・1週間後・2週間後・1か月後", () => {
    expect(INTERVALS_DAYS).toEqual([0, 1, 3, 7, 14, 30]);
  });

  it("漢字で正解すると1段階すすむ", () => {
    const result = nextSchedule(0, "maru", now);
    expect(result.srsLevel).toBe(1);
    expect(result.nextDueAt).toBe(now + 1 * DAY);
  });

  it("すすむほど間隔が長くなる", () => {
    expect(nextSchedule(2, "maru", now).nextDueAt).toBe(now + 7 * DAY);
    expect(nextSchedule(4, "maru", now).nextDueAt).toBe(now + 30 * DAY);
  });

  it("上限をこえない", () => {
    expect(nextSchedule(5, "maru", now).srsLevel).toBe(5);
  });

  it("まちがえると段階が戻り、すぐまた出る", () => {
    const result = nextSchedule(4, "batsu", now);
    expect(result.srsLevel).toBe(2);
    expect(result.nextDueAt).toBe(now + 3 * DAY);
  });

  it("ひらがな正解は据え置き", () => {
    expect(nextSchedule(3, "sankaku", now).srsLevel).toBe(3);
  });

  it("期日が来たかを判定できる", () => {
    const record = createProgressEntry();
    record.nextDueAt = now + DAY;
    expect(isDue(record, now)).toBeFalsy();
    expect(isDue(record, now + DAY + 1)).toBeTruthy();
  });

  it("まだ解いていないものはいつでも出せる", () => {
    expect(isDue(createProgressEntry(), now)).toBeTruthy();
  });
});

/* =========================================================================
 * 出題
 * ======================================================================= */
describe("question ― 出題の重みと候補", () => {
  it("解いていない県・まちがえた県ほど出やすい", () => {
    const fresh = createProgressEntry();
    const wrong = { ...createProgressEntry(), nameWrong: 2, lastJudge: "batsu" };
    const mastered = { ...createProgressEntry(), nameCorrect: 5, streak: 5, lastJudge: "maru" };

    expect(weightOf(wrong, "name") > weightOf(fresh, "name")).toBeTruthy();
    expect(weightOf(fresh, "name") > weightOf(mastered, "name")).toBeTruthy();
  });

  it("復習の期日が来ると重みが倍になる", () => {
    const now = Date.now();
    const notDue = { ...createProgressEntry(), nameCorrect: 1, nextDueAt: now + DAY };
    const due = { ...createProgressEntry(), nameCorrect: 1, nextDueAt: now - DAY };
    expect(weightOf(due, "name", now)).toBe(weightOf(notDue, "name", now) * 2);
  });

  it("苦手かどうかを判定できる", () => {
    expect(isWeak(createProgressEntry())).toBeFalsy();
    expect(isWeak({ ...createProgressEntry(), nameWrong: 1, lastJudge: "batsu" })).toBeTruthy();
  });

  it("認識の候補に漢字・かな・接尾辞つきがすべて入る", () => {
    const candidates = buildCandidates(SUBJECTS, "name");
    expect(candidates.kanji).toContain("神奈川");
    expect(candidates.kanji).toContain("神奈川県");
    expect(candidates.kana).toContain("かながわ");
    expect(candidates.kana).toContain("かながわけん");
    expect(candidates.kanji).toContain("北海道");
  });

  it("漢字とかなの候補は混ざらない（認識の取り違えを防ぐため）", () => {
    const candidates = buildCandidates(SUBJECTS, "name");
    expect(candidates.kanji.includes("かながわ")).toBeFalsy();
    expect(candidates.kana.includes("神奈川")).toBeFalsy();
  });
});

/* =========================================================================
 * 地図データ
 * ======================================================================= */
describe("map ― 形状データの整合性", () => {
  it("47県すべてに形があり、マスの重複も範囲外もない", () => {
    expect(validateShapes(PREFECTURE_IDS)).toHaveLength(0);
  });

  it("どの県のマスも辺でつながっている（角だけの接触がない）", () => {
    for (const id of PREFECTURE_IDS) {
      const cells = cellsOf(id);
      const seen = new Set([`${cells[0].col},${cells[0].row}`]);
      const queue = [cells[0]];
      const all = new Set(cells.map((c) => `${c.col},${c.row}`));

      while (queue.length > 0) {
        const { col, row } = queue.pop();
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const key = `${col + dc},${row + dr}`;
          if (all.has(key) && !seen.has(key)) {
            seen.add(key);
            const [c, r] = key.split(",").map(Number);
            queue.push({ col: c, row: r });
          }
        }
      }
      if (seen.size !== cells.length) {
        throw new Error(`id=${id} のマスが分かれています（${seen.size}/${cells.length}）`);
      }
    }
  });

  it("すべての県が SVG のパスになる", () => {
    for (const id of PREFECTURE_IDS) {
      const path = cellsToPath(cellsOf(id), 10);
      expect(path.startsWith("M")).toBeTruthy();
      expect(path.endsWith("Z")).toBeTruthy();
    }
  });

  it("ラベルの位置が県の中に入る", () => {
    for (const id of PREFECTURE_IDS) {
      const cells = cellsOf(id);
      const name = PREFECTURE_BY_ID.get(id).name;
      const layout = labelLayout(cells, name.length, 10);
      if (!layout) continue;           // 収まらない県はラベルを出さない
      const col = Math.floor(layout.x / 10) + 1;
      const row = Math.floor(layout.y / 10) + 1;
      const inside = cells.some((c) => c.col === col && c.row === row);
      if (!inside) throw new Error(`id=${id}（${name}）のラベルが県の外にあります`);
    }
  });

  it("ラベルが県の幅からはみ出さない", () => {
    // はみ出したまま出すと、となりの県の上に名前が重なって読めなくなる
    for (const id of PREFECTURE_IDS) {
      const cells = cellsOf(id);
      const name = PREFECTURE_BY_ID.get(id).name;
      const layout = labelLayout(cells, name.length, 10);
      if (!layout) continue;

      // ラベルは中心（layout.x, layout.y）から左右（または上下）に
      // 文字数ぶん広がる。その各文字が乗るマスがすべてその県のものであること。
      const horizontal = layout.orientation === "horizontal";
      const startEdge = (horizontal ? layout.x : layout.y) - (name.length * 10) / 2;

      for (let i = 0; i < name.length; i++) {
        const center = startEdge + (i + 0.5) * 10;
        const c = horizontal ? Math.floor(center / 10) + 1 : Math.floor(layout.x / 10) + 1;
        const r = horizontal ? Math.floor(layout.y / 10) + 1 : Math.floor(center / 10) + 1;
        if (!cells.some((cell) => cell.col === c && cell.row === r)) {
          throw new Error(`id=${id}（${name}）のラベルが県からはみ出します`);
        }
      }
    }
  });

  it("県名のラベルが出せる県が8割以上ある", () => {
    // 地図としての手がかりが減りすぎていないことの確認
    const withLabel = PREFECTURE_IDS.filter((id) => {
      const name = PREFECTURE_BY_ID.get(id).name;
      return labelLayout(cellsOf(id), name.length, 10) !== null;
    });
    if (withLabel.length < PREFECTURE_IDS.length * 0.8) {
      throw new Error(`ラベルを出せるのが ${withLabel.length}/47 しかありません`);
    }
  });

  it("グリッドからはみ出さない", () => {
    for (const id of PREFECTURE_IDS) {
      for (const { col, row } of cellsOf(id)) {
        expect(col >= 1 && col <= GRID_COLS).toBeTruthy();
        expect(row >= 1 && row <= GRID_ROWS).toBeTruthy();
      }
    }
  });
});

/* =========================================================================
 * 教材データ
 * ======================================================================= */
describe("content ― 都道府県データ", () => {
  it("47件ある", () => {
    expect(PREFECTURES).toHaveLength(47);
  });

  it("id が 1..47 で重複しない", () => {
    expect([...new Set(PREFECTURE_IDS)]).toHaveLength(47);
    expect(Math.min(...PREFECTURE_IDS)).toBe(1);
    expect(Math.max(...PREFECTURE_IDS)).toBe(47);
  });

  it("すべての県に必要な項目がそろっている", () => {
    for (const p of PREFECTURES) {
      for (const key of ["name", "reading", "capital", "capitalReading",
                         "region", "specialty", "fact", "population"]) {
        if (!p[key]) throw new Error(`${p.name} の ${key} が空です`);
      }
      if (!Array.isArray(p.famous) || p.famous.length === 0) {
        throw new Error(`${p.name} の famous が空です`);
      }
    }
  });

  it("読みがすべてひらがなである（採点の前提）", () => {
    for (const p of PREFECTURES) {
      if (!/^[ぁ-ゟ]+$/.test(p.reading)) throw new Error(`${p.name} の読みが不正: ${p.reading}`);
      if (!/^[ぁ-ゟ]+$/.test(p.capitalReading)) {
        throw new Error(`${p.capital} の読みが不正: ${p.capitalReading}`);
      }
    }
  });

  it("県名が重複しない（採点で取り違えないため）", () => {
    expect([...new Set(PREFECTURES.map((p) => p.name))]).toHaveLength(47);
  });

  it("地方の割り当てが 9 地方に収まっている", () => {
    const ids = new Set(REGIONS.map((r) => r.id));
    for (const p of PREFECTURES) {
      if (!ids.has(p.region)) throw new Error(`${p.name} の地方が不正: ${p.region}`);
    }
  });
});

/* =========================================================================
 * 敵
 * ======================================================================= */
describe("enemies ― 敵のバランス", () => {
  it("9地方 × 3体 ＋ 魔王 = 28体", () => {
    expect(ALL_ENEMIES).toHaveLength(28);
  });

  it("どの地方にもボスがいる", () => {
    for (const region of REGIONS) {
      const list = ENEMIES_BY_REGION[region.id];
      expect(list).toHaveLength(3);
      expect(list[2].tier).toBe("boss");
    }
  });

  it("南へ進むほど強くなる", () => {
    let previousHp = 0;
    for (const region of REGIONS) {
      const boss = ENEMIES_BY_REGION[region.id][2];
      expect(boss.maxHp > previousHp).toBeTruthy();
      previousHp = boss.maxHp;
    }
    expect(DEMON_LORD.maxHp > previousHp).toBeTruthy();
  });

  it("敵の攻撃力の伸びが、プレイヤーの守備力の伸びを上回る", () => {
    // 上回らないと後半で反撃が無害になり、HPの意味が消える
    const first = ENEMIES_BY_REGION[REGIONS[0].id][2];
    const last = ENEMIES_BY_REGION[REGIONS[8].id][2];
    const enemyGrowth = (last.atk - first.atk) / 8;   // 1地方あたり
    const playerDefGrowth = 2 * 1.7 * 0.25;           // 守備+2/Lv × 約1.7Lv/地方 × 効き目
    expect(enemyGrowth > playerDefGrowth).toBeTruthy();
  });
});

/* =========================================================================
 * 習熟度
 * ======================================================================= */
describe("analytics ― 習熟度", () => {
  it("解いていなければ 0", () => {
    expect(masteryOf(createProgressEntry())).toBe(0);
  });

  it("1回だけの正解を満点にしない（まぐれ当たり対策）", () => {
    const once = { ...createProgressEntry(), nameCorrect: 1, streak: 1 };
    expect(masteryOf(once) < 1).toBeTruthy();
  });

  it("漢字で連続正解すると高くなる", () => {
    const record = { ...createProgressEntry(), nameCorrect: 5, streak: 5 };
    expect(masteryOf(record)).toBeCloseTo(1, 0.01);
  });

  it("ひらがな正解は漢字より低く評価される", () => {
    const kanji = { ...createProgressEntry(), nameCorrect: 3, streak: 3 };
    const kana = { ...createProgressEntry(), nameKana: 3, streak: 3 };
    expect(masteryOf(kanji) > masteryOf(kana)).toBeTruthy();
  });

  it("まちがえた回数が多いほど低くなる", () => {
    const good = { ...createProgressEntry(), nameCorrect: 3, nameWrong: 0, streak: 3 };
    const bad = { ...createProgressEntry(), nameCorrect: 3, nameWrong: 5, streak: 1 };
    expect(masteryOf(good) > masteryOf(bad)).toBeTruthy();
  });
});

/* =========================================================================
 * セーブ
 * ======================================================================= */
describe("save ― セーブデータ", () => {
  it("新規データに47県ぶんの記録がある", () => {
    const save = createNewSave(PREFECTURE_IDS);
    expect(Object.keys(save.progress)).toHaveLength(47);
    expect(Object.keys(save.dex)).toHaveLength(47);
    expect(save.version).toBe(SAVE_VERSION);
  });

  it("JSON にして戻しても同じ", () => {
    const save = createNewSave(PREFECTURE_IDS);
    expect(JSON.parse(JSON.stringify(save))).toEqual(save);
  });

  it("連続学習日数を数えられる", () => {
    expect(countDayStreak([])).toBe(0);
    expect(countDayStreak(["2026-08-02", "2026-08-03", "2026-08-04"])).toBe(3);
    // 途中で1日あくと、そこで切れる
    expect(countDayStreak(["2026-08-01", "2026-08-03", "2026-08-04"])).toBe(2);
  });

  it("日付キーを作れる", () => {
    expect(toDateKey(new Date(2026, 7, 4))).toBe("2026-08-04");
    expect(toDateKey(new Date(2026, 11, 25))).toBe("2026-12-25");
  });
});

/* =========================================================================
 * 乱数
 * ======================================================================= */
describe("random ― 再現できる乱数", () => {
  it("たねを固定すると同じ結果になる", () => {
    setSeed(42);
    const first = [shuffle([1, 2, 3, 4, 5]), shuffle([1, 2, 3, 4, 5])];
    setSeed(42);
    const second = [shuffle([1, 2, 3, 4, 5]), shuffle([1, 2, 3, 4, 5])];
    expect(first).toEqual(second);
    setSeed(null);
  });

  it("重みが大きいほど選ばれやすい", () => {
    setSeed(7);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 2000; i++) counts[pickWeighted(["a", "b"], [9, 1])]++;
    expect(counts.a > counts.b * 5).toBeTruthy();
    setSeed(null);
  });

  it("重みがすべて0でも落ちない", () => {
    expect(["a", "b"]).toContain(pickWeighted(["a", "b"], [0, 0]));
  });
});
