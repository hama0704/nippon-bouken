/**
 * kana.js ― 日本語の文字列をくらべるための道具箱。
 *
 * 採点で「同じ答え」とみなす範囲をここが決めている。
 * 例）「かながわ」「カナガワ」「神奈川県」「かながわけん」はすべて
 *     同じ県を指しているが、○なのか△なのかは scoring-engine が判断する。
 *     このファイルは「くらべやすい形にそろえる」ところまでを受け持つ。
 */

/**
 * 接尾辞（都・道・府・県・市…）と、その読み。
 *
 * ■ 「文字列の末尾を見て接尾辞を削る」ことは絶対にしない
 *   「京都」の「都」、「甲府」の「府」、「水戸」の読み「みと」の「と」は
 *   接尾辞ではなく名前の一部。末尾一致で削ると、正しい答えが×になる。
 *   そのかわり、答えのデータが持っている suffix を使って
 *   「正解として認める形」を組み立てる（acceptedForms）。
 */
export const SUFFIX_READING = Object.freeze({
  都: "と", 道: "どう", 府: "ふ", 県: "けん",
  市: "し", 区: "く", 町: "ちょう", 村: "むら",
});

/**
 * 正解として認める書き方の一覧を作る。
 * 「神奈川」と「神奈川県」、「かながわ」と「かながわけん」のどちらでもよい。
 *
 * @param {{kanji:string, kana:string, suffix:string}} answer
 * @returns {{ kanji: string[], kana: string[] }}
 */
export function acceptedForms(answer) {
  const kanji = normalize(answer.kanji);
  const kana = normalize(answer.kana);
  const suffix = answer.suffix ?? "";
  const kanaSuffix = SUFFIX_READING[suffix] ?? "";

  return {
    kanji: suffix ? [kanji, kanji + suffix] : [kanji],
    kana: kanaSuffix ? [kana, kana + kanaSuffix] : [kana],
  };
}

/**
 * カタカナをひらがなに変換する。
 * 「ソウ」と書く子もいるので、かな解答の判定前に必ず通す。
 */
export function toHiragana(text) {
  return text.replace(/[ァ-ヶ]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

/** ひらがなをカタカナに変換する（表示の都合で使うことがある） */
export function toKatakana(text) {
  return text.replace(/[ぁ-ゖ]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60)
  );
}

/**
 * 比較用に文字列をそろえる。
 *  - 全角英数・半角カナを標準形へ（NFKC）
 *  - 空白をすべて取り除く（マス目に書くので空白に意味はない）
 *  - 長音符「ー」を前の音の母音に開く（「トーキョー」→「トウキョウ」）
 */
export function normalize(text) {
  return expandChoon(
    String(text ?? "")
      .normalize("NFKC")
      .replace(/[\s　]/g, "")
  );
}

/**
 * かな → その音を伸ばすときに書く文字（現代仮名遣い）。
 *   あ段は「あ」、い段は「い」、う段は「う」、
 *   え段は「い」（せんせい）、お段は「う」（とうきょう）。
 * 「お段は お」ではないことに注意。「とおきょお」は誤り。
 */
const LONG_VOWEL_OF = (() => {
  const rows = [
    ["あ", "あかさたなはまやらわがざだばぱぁゃゎ"],
    ["い", "いきしちにひみりぎじぢびぴぃ"],
    ["う", "うくすつぬふむゆるぐずづぶぷっぅゅ"],
    ["い", "えけせてねへめれげぜでべぺぇ"],
    ["う", "おこそとのほもよろをごぞどぼぽぉょ"],
  ];
  const map = new Map();
  for (const [vowel, chars] of rows) {
    for (const char of chars) {
      map.set(char, vowel);
      // カタカナ側も同じ扱いにする
      map.set(String.fromCharCode(char.charCodeAt(0) + 0x60), toKatakana(vowel));
    }
  }
  return map;
})();

/**
 * 長音符を、伸ばした音のかなに置き換える。
 * 単に取り除くと「トーキョー」が「トキョ」になってしまい、
 * 正しい読みなのに不正解になる。
 */
function expandChoon(text) {
  let out = "";
  for (const char of text) {
    if (/[ー―−‐]/.test(char) && out.length > 0) {
      out += LONG_VOWEL_OF.get(out[out.length - 1]) ?? "";
    } else {
      out += char;
    }
  }
  return out;
}

/** 文字列がすべてひらがな（＋長音符）か */
export function isAllHiragana(text) {
  return /^[ぁ-ゟ]+$/.test(normalize(text));
}

/** 文字列に漢字が含まれるか */
export function containsKanji(text) {
  return /[一-鿿]/.test(text);
}

/**
 * レーベンシュタイン距離（何文字直せば同じになるか）。
 * 「崎玉」と「埼玉」のような惜しい間違いを見つけて、
 * 「おしい！」というフィードバックを返すために使う。
 */
export function editDistance(a, b) {
  const s = normalize(a);
  const t = normalize(b);
  if (s === t) return 0;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;

  // 1行ぶんだけ持って更新していく（メモリ節約）
  let previous = Array.from({ length: t.length + 1 }, (_, i) => i);

  for (let i = 1; i <= s.length; i++) {
    const current = [i];
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,      // 挿入
        previous[j] + 1,         // 削除
        previous[j - 1] + cost   // 置換
      );
    }
    previous = current;
  }
  return previous[t.length];
}

/**
 * 「どのくらい似ているか」を 0〜1 で返す。
 * 1 が完全一致。ヒントの出し分けなどに使う。
 */
export function similarity(a, b) {
  const maxLength = Math.max(normalize(a).length, normalize(b).length);
  if (maxLength === 0) return 1;
  return 1 - editDistance(a, b) / maxLength;
}

/**
 * 答えを一部だけ見せる（ヒント3段階目で使う）。
 * 「神奈川」→「神○○」のように、先頭から revealCount 文字だけ残す。
 */
export function maskAnswer(text, revealCount = 1, maskChar = "○") {
  const chars = [...normalize(text)];
  return chars.map((char, i) => (i < revealCount ? char : maskChar)).join("");
}
