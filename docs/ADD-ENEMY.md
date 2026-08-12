# 新しい敵の追加のしかた

敵は「**強さの数字**」と「**絵**」の2つでできています。
強さは地方の順番から自動計算されるので、手で数字を並べる必要はありません。

---

## 1. いまの構成

`src/content/enemies.js` に、地方ごとの見た目と名前だけを書いています。

```js
const REGION_THEMES = {
  hokkaido: { art: "snow",    names: ["こゆきだま", "つらら坊",   "ブリザードキング"] },
  tohoku:   { art: "oni",     names: ["こおに",     "あかおに",   "なまはげ大王"] },
  ...
};
```

- 配列の1・2番目が「ざこ」、3番目が「中ボス」
- HP と攻撃力は、その地方が北から何番目かをもとに計算されます
- 9地方 × 3体 ＋ 魔王 = 28体

---

## 2. 名前だけ変える（いちばん簡単）

`REGION_THEMES` の `names` を書き換えるだけです。

```js
tohoku: { art: "oni", names: ["こおに", "あかおに", "なまはげ大王"] },
                              ↑ ここを変える
```

---

## 3. 地方の敵を4体に増やす

`names` に1つ足し、`buildRegionEnemies()` の戻り値も合わせます。

```js
// enemies.js
tohoku: { art: "oni", names: ["こおに", "あかおに", "あおおに", "なまはげ大王"] },

// 同じファイルの下のほう
return [make(0, "normal"), make(1, "normal"), make(2, "normal"), make(3, "boss")];
```

「その地方が何体いるか」は `enemyCountOf()` が配列の長さから判断するので、
戦闘の進行やクリア判定の側は直す必要がありません。

---

## 4. 新しい絵を追加する

`src/ui/components/enemy-art.js` の `ART` に関数を1つ足します。
座標系は `0 0 100 100` の正方形です。

```js
const ART = {
  // …既存の絵…

  /** 新しい敵：たとえば「石の巨人」 */
  golem: (c) => el("g", {},
    // c.body に、その地方の色（CSS変数）が入っている
    el("rect", { x: 26, y: 30, width: 48, height: 46, rx: 8, fill: c.body }),
    el("rect", { x: 18, y: 76, width: 64, height: 16, rx: 6, fill: "#57534e" }),
    eyes(50, 50, 12, 6),
    path("M40 64 Q50 70 60 64", "none",
      { stroke: "#1b2030", "stroke-width": 3, "stroke-linecap": "round" })
  ),
};
```

使える道具（同じファイルの上のほうで定義しています）

| 関数 | 意味 |
|---|---|
| `path(d, fill, extra)` | SVGパス |
| `circle(cx, cy, r, fill, extra)` | 円 |
| `ellipse(cx, cy, rx, ry, fill, extra)` | 楕円 |
| `eyes(cx, cy, spread, r)` | まるい目（どの敵にも付けると統一感が出る） |
| `angryBrows(cx, cy, spread)` | おこった眉（ボス向き） |
| `el("rect", {...})` | そのほかのSVG要素はすべて `el()` で作れます |

書いたら `enemies.js` の `art` にその名前を指定します。

```js
chugoku: { art: "golem", names: [...] },
```

> **絵文字は使わないでください。** OS やフォントによって見た目が変わり、
> 意図した怖さ・かわいさが崩れます。PNG も配信が重くなるので使っていません。

---

## 5. 全体の難易度を変える

`src/content/enemies.js` の `BALANCE` を1か所変えれば、28体すべてに反映されます。

```js
export const BALANCE = {
  minionHp:      { base: 26, perRegion: 16 },  // ざこのHP
  bossHp:        { base: 70, perRegion: 46 },  // 中ボスのHP
  minionAtk:     { base: 4,  perRegion: 2.4 }, // ざこの攻撃力
  bossAtk:       { base: 8,  perRegion: 3.6 },
  demonLordHp:   520,
  demonLordAtk:  38,
};
```

- **HP を下げる** → 早く倒せる＝テンポが上がる
- **攻撃力を下げる** → まちがえても痛くない＝やさしくなる

### 気をつけること

**敵の攻撃力の伸び（`perRegion`）を、プレイヤーの守備力の伸びより小さくしないでください。**
守備力はレベルごとに +2 上がり、1地方あたりおよそ1.7レベル上がるので、
攻撃力の伸びが小さいと後半で反撃がまったく効かなくなり、
HP という仕組み自体が意味を失います。

これは実際に一度そうなりました。いまはテスト
「敵の攻撃力の伸びが、プレイヤーの守備力の伸びを上回る」が見張っています。

### 調整のたしかめ方

数字を変えたら、ブラウザのコンソールで通しプレイを試せます。

```js
// tests/run.html か本体を開いた状態で
const { Store } = await import('/src/core/store.js');
const { BattleEngine } = await import('/src/engine/battle-engine.js');
const { applyAnswer } = await import('/src/engine/progress-engine.js');
const { PREFECTURE_IDS } = await import('/src/content/prefectures.js');

localStorage.removeItem('prefRPG:save:v1');
const store = new Store(PREFECTURE_IDS);
const battle = new BattleEngine(store);
let q = 0, downs = 0;
while (!battle.isGameCleared && q < 3000) {
  q++;
  const judge = Math.random() < 0.6 ? 'maru' : Math.random() < 0.5 ? 'sankaku' : 'batsu';
  applyAnswer({ store, question: { subjectId: 1 + q % 47, part: 'name' },
                judge, hintLevel: 0, elapsedMs: 8000 });
  if (battle.resolve(judge).playerDown) downs++;
}
console.log({ 問題数: q, レベル: store.player.level, 倒れた回数: downs });
```

**目安**：正答率60%で 180〜220問、HPが0になるのは0〜1回。
1地方あたり12〜30問（＝1時間ぶんの学習）に収まっていると、区切りがつけやすくなります。
