# 新しい問題・新しい教材の追加

## A. 都道府県の中で問題を増やす

### 出題の種類を増やす（例：名産クイズ）

いまは `name`（県名）と `capital`（県庁所在地）の2種類です。
3つ目を足すには、`src/content/prefecture-pack.js` の `answers` に追加します。

```js
answers: {
  name:      { kanji: prefecture.name,    kana: prefecture.reading,        suffix: prefecture.suffix },
  capital:   { kanji: prefecture.capital, kana: prefecture.capitalReading, suffix: prefecture.capitalSuffix },
  specialty: { kanji: prefecture.specialty, kana: prefecture.specialtyReading, suffix: "" },  // ← 追加
},
```

次に `src/ui/screens/mode-screen.js` の `MODES` に選択肢を足します。

```js
{ id: "specialty", num: "④", title: "名産モード",
  desc: "光っている県の 名産を 書こう。" },
```

最後に `src/engine/question-engine.js` の `#buildQuestion()` で、
その種類のときに出す問題文を書きます。

```js
questionText: part === "capital" ? "光っている県の 県庁所在地を 書こう"
            : part === "specialty" ? "光っている県の 名産を 書こう"
            : "光っている県の 名前を 書こう",
```

採点・経験値・戦闘・記録は何も直さずにそのまま動きます。

---

## B. まったく別の教材を作る（世界地図・歴史人物など）

**engine/ は都道府県を一切知りません。** 知っているのは Subject という形だけです。
だから、同じ形のデータを用意すれば、出題・採点・成長・戦闘の仕組みを丸ごと流用できます。

### Subject の形

```js
{
  id: 1,
  answers: {
    name:    { kanji: "フランス", kana: "ふらんす", suffix: "" },
    capital: { kanji: "パリ",     kana: "ぱり",     suffix: "" },
  },
  meta: {
    region: "europe",        // グループ分け（地方にあたるもの）
    regionName: "ヨーロッパ",
    regionColorVar: "--c-region-kanto",
    fact: "…",               // 図鑑に出す情報（自由に増やしてよい）
  },
}
```

### 手順

**1. データを作る**

`src/content/countries.js` のようなファイルに一覧を書きます。

**2. パックを作る**

`src/content/country-pack.js` を作り、`prefecture-pack.js` と同じ3つを公開します。

```js
export const SUBJECTS = COUNTRIES.map((country) => ({ id, answers, meta }));
export function findOtherSubject(text, exceptId) { ... }   // 「それは○○だよ」用
export function prefectureOf(id) { ... }                    // 表示用の元データ引き
```

`findOtherSubject` は `acceptedForms()`（`src/utils/kana.js`）を使って書いてください。
文字列の末尾から接尾辞を削る書き方は、名前の一部まで削ってしまうので使いません。

**3. 地図の形を作る**（地図を使う教材の場合）

`src/content/country-shapes.js` に `SPANS` と `GRID_COLS` / `GRID_ROWS` を定義します。
形式は `pref-paths.js` と同じで、SVG のパス文字列・外接矩形・ラベル位置の3つです。

地図が要らない教材（歴史人物など）なら、`map-renderer` の代わりに
人物の絵や年表を出すコンポーネントを作り、問題画面で差し替えます。

**4. 差し替える**

`src/ui/screens/quiz-screen.js` などの import 元を新しいパックに変えます。

```js
// import { SUBJECTS, findOtherSubject } from "../../content/prefecture-pack.js";
import { SUBJECTS, findOtherSubject } from "../../content/country-pack.js";
```

**5. 敵を用意する**

`src/content/enemies.js` の `REGION_THEMES` を、新しいグループのidに合わせます。

---

## C. 教材を「選べる」ようにする（将来の発展）

いまは1つの教材を直接 import しています。
複数を切り替えたい場合は、パックを引数で渡す形に変えるのが素直です。

```js
// main.js
const pack = await loadPack(store.settings.packId);   // "prefectures-jp" | "countries" | …
const router = new ScreenRouter(mountPoint, { store, audio, pack });

// quiz-screen.js
export function QuizScreen({ store, router, pack, params }) {
  const engine = new QuestionEngine({ subjects: pack.SUBJECTS, ... });
```

このとき、セーブデータは教材ごとに分ける必要があります。
`save-manager.js` の `STORAGE_KEY` にパックIDを混ぜてください。

```js
const STORAGE_KEY = `prefRPG:save:v1:${packId}`;
```

混ぜないと、都道府県の記録の上に世界地図の記録が上書きされます。

---

## 追加したら必ずすること

1. **テストを足す** ― `tests/tests.js` の「content ― 都道府県データ」を真似て、
   新しいデータにも「読みがひらがなだけ」「名前が重複しない」などの検査を書きます。
   データの打ちまちがいは目で見つけるのが難しく、テストがいちばん確実です。

2. **`sw.js` の `PRECACHE_URLS` に新しいファイルを足す** ―
   忘れるとオフラインでそのファイルだけ読み込めません。

3. **`npm test` を実行する**
