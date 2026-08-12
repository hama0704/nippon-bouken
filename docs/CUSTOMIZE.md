# カスタマイズのしかた

学級の実態に合わせて調整したくなる場所を、上から順に並べました。
どれも **1ファイルの数行を書き換えるだけ** で済むようにしてあります。

作業のあとは必ず `npm test`（または `tests/run.html`）を実行してください。
うっかり壊した場合はテストが教えてくれます。

---

## 1. 採点のきまりを変える

`src/engine/scoring-engine.js` の `judgeAnswer()` がすべてを決めています。

### 例：ひらがなも○にしたい（3年生など、漢字をまだ習っていない場合）

```js
// 変更前
return result(Judge.SANKAKU, "kana", "よみは あっているよ。…");

// 変更後
return result(Judge.MARU, "kana", "せいかい！");
```

### 例：漢字が1文字ちがう場合を△にしたい（甘めに採点する）

```js
// 変更前
if (containsKanji(input)) {
  return result(Judge.BATSU, "kanji-wrong", "おしい！かんじが 1つ ちがうよ。…");
}

// 変更後
if (containsKanji(input)) {
  return result(Judge.SANKAKU, "kanji-wrong", "おしい！かんじを よく見てみよう。");
}
```

> **注意**：`src/utils/kana.js` の `acceptedForms()` は
> 「県」「市」の有無を吸収するための関数です。
> ここを「文字列の末尾から接尾辞を削る」方式に書き換えないでください。
> 「京都」の「都」や「甲府」の「府」まで削れて、正解が×になります。
> （テスト「名前の一部である『都』『府』を接尾辞と取りちがえない」が守っています）

---

## 2. 経験値を変える

`src/engine/progress-engine.js` の上のほうにまとまっています。

```js
export const EXP_TABLE = {
  firstKanji:   100,  // はじめて漢字で正解
  firstKana:     60,  // はじめてひらがなで正解
  secondKanji:   50,  // 2回目
  secondKana:    30,
  repeatKanji:   20,  // 3回目以降
  repeatKana:    12,
  comeback:     120,  // 前回まちがえた問題に正解
};

export const HINT_PENALTY = [1, 0.9, 0.75, 0.5];  // ヒント0〜3回のときの倍率
```

レベルアップに必要な経験値は同じファイルの `expToNextLevel()` です。

```js
export function expToNextLevel(level) {
  return 120 + (level - 1) * 80;   // 数字を小さくすると早くレベルが上がる
}
```

レベルアップで上がるステータスは `GROWTH` です。

```js
const GROWTH = { maxHp: 6, atk: 3, def: 2, spd: 2 };
```

---

## 3. 復習の間隔を変える

`src/engine/srs-engine.js`。

```js
export const INTERVALS_DAYS = [0, 1, 3, 7, 14, 30];
```

段階を増やしたければ配列に足すだけです（例：`[0, 1, 3, 7, 14, 30, 60]`）。
`srsLevel` はこの配列の添字なので、上限は自動的に伸びます。

---

## 4. 難易度の選択肢を変える

`src/ui/screens/mode-screen.js` の上のほうにあります。

```js
const TIMER_OPTIONS = [
  { id: 0,  label: "じかん なし" },
  { id: 30, label: "30びょう" },
  { id: 15, label: "15びょう" },
];
```

`{ id: 45, label: "45びょう" }` のように1行足せば選択肢が増えます。
問題画面側は `options.timeLimit` を秒数として読むだけなので、追加の作業は不要です。

---

## 5. ヒントの文章を変える

`src/engine/question-engine.js` の `buildHints()`。

```js
{
  level: 2,
  title: "さいしょの文字",
  text: `「${chars[0]}」からはじまるよ。よみは「${answer.kana[0]}…」。`,
},
```

段階を4つに増やしたい場合は、この配列に足すだけです。
経験値の減り方は `HINT_PENALTY`（上記2）の配列も同じ長さに合わせてください。

---

## 6. 出題の出やすさを変える

`src/engine/question-engine.js` の `WEIGHTS`。数字が大きいほど出やすくなります。

```js
const WEIGHTS = {
  neverAnswered: 3.0,   // まだ一度も解いていない
  lastWrong:     4.0,   // 直前に間違えた
  weak:          2.5,   // 正答率が低い
  normal:        1.0,
  mastered:      0.35,  // 連続で正解できている
};

const FOCUS_BOOST = 3;   // いま冒険中の地方が出やすくなる倍率
const RECENT_MEMORY = 6; // 直前の何問ぶん、同じ県を避けるか
```

---

## 7. 都道府県のデータを直す

`src/content/prefectures.js`。1県が1つのまとまりです。

```js
{
  id: 14, name: "神奈川", reading: "かながわ", suffix: "県",
  capital: "横浜", capitalReading: "よこはま", capitalSuffix: "市",
  region: "kanto",
  specialty: "シウマイ",
  fact: "横浜は日本最大の港のひとつ！中華街も有名。",
  population: "約923万人",
  famous: ["鎌倉の大仏", "横浜中華街", "箱根の温泉"],
},
```

**守るべきこと**（テストが検査しています）

- `reading` と `capitalReading` は **ひらがなだけ**。採点がここを基準にします
- `suffix` は「都・道・府・県」、`capitalSuffix` は「市」など。名前の本体に含めない
  - 例：「北海道」は `name: "北海道", suffix: ""`（道は名前の一部）
  - 例：「東京」は `name: "東京", suffix: "都"`
- `famous` は空にしない
- `region` は `regions.js` にある9つのどれか

---

## 8. 地図の形を直す

地図は手で座標を置いたものではなく、**実際の地理データから生成**しています。

```bash
cd prefecture-rpg
node tools/generate-map.mjs
```

これで3つのファイルが `tools/` に出ます。

| ファイル | 中身 |
|---|---|
| `spans.txt` | `src/content/pref-shapes.js` に貼るデータ |
| `map-preview.png` | 地方ごとに色分けした確認用の画像。**まずこれを見てください** |
| `map.txt` | 同じものを文字で表したもの |

`tools/generate-map.mjs` の上のほうにある表を編集すると形が変わります。

```js
// id: [名前, 緯度, 経度, 面積km², 島, 横の伸び, 縦の伸び]
20: ["長野", 36.2, 138.1, 13562, "honshu", 0.7, 1.5],
//                                          ↑    ↑
//                                   横に縮め  縦に伸ばす（長野は南北に長い）
```

全体の大きさや詰まり具合は、こちらで調整します。

```js
const MIN_CELLS = 3;          // 1県あたりの最小マス数（指でタップできる下限）
const COL_PER_LON = 2.15;     // 経度1度あたりのマス数。大きいほど横に広がる
const ROW_PER_LAT = 2.6;      // 緯度1度あたりのマス数
const PULL = { hokkaido: { lat: 1.25 }, ... };  // 島を本州へ引き寄せる量
```

### なぜ生成にしているか

47県ぶんの座標を手で置くと、必ずどこかがずれます（実際、最初の版は
北海道が大きすぎ、九州と四国が地続きになっていました）。
緯度経度から作れば、位置関係は自動的に正しくなります。

### 生成後に手で直してもよい

`pref-shapes.js` を直接編集して構いません。実際、和歌山だけは
生成結果が「最長2マス」で3文字の県名が置けなかったため、1マス足しています。

守ること（テストが見張っています）

- ひとつの県のマスは必ず**辺**でつながっていること（角だけの接触はNG）
- 1県あたり3マス以上
- 別の島（北海道・本州・四国・九州）どうしを辺で接触させない

### 地図を直したらアイコンも作り直す

PWA のアイコンは同じ地図データから作っています。形を変えたら
`assets/icons/` の4つのPNGも作り直してください（作り方は `docs/PWA.md`）。

---

## 9. 手書き欄のマスの数を変える

`src/ui/components/handwriting-pad.js`。

```js
export const DEFAULT_CELL_COUNT = 6;
```

6マスは「かながわけん」「ほっかいどう」「うつのみやし」が収まる数です。
減らすと1マスが大きくなって書きやすくなりますが、長い読みが書けなくなります。

---

## 10. 文字認識の厳しさを変える

`src/platform/recognition/stroke-recognizer.js`。

```js
const THRESHOLDS = {
  minScore: 0.55,      // これ未満なら「読めていない」
  goodScore: 0.90,     // ここまで似ていれば十分
  clearMargin: 0.06,   // 1位と2位の差がこれ以上あれば迷っていない
  confirmBelow: 0.60,  // 総合の自信度がこれ未満なら自分で丸つけへ
};
```

`confirmBelow` を**下げる**と自動採点が増え、**上げる**と自己確認が増えます。

**まずは厳しめ（自己確認が多め）のまま使ってください。**
自動で誤採点されるほうが、自分で丸つけするより子どもにとってずっと辛いためです。
実際の児童の字で試してから、少しずつ下げるのがおすすめです。
