# 見た目の変え方

## 元栓は tokens.css の1枚だけ

`styles/tokens.css` にすべての色・文字サイズ・余白・角丸が変数として置いてあります。
**ここを変えれば全画面が一度に変わります。** 各画面のCSSは変数を参照しているだけです。

```css
:root {
  --c-bg:          #16233f;   /* 画面いちばん奥 */
  --c-surface:     #22345c;   /* パネルの面 */
  --c-accent:      #ffcc33;   /* アクセント（金） */
  --c-text:        #f2f6ff;
  ...
}
```

---

## よくある変更

### 全体の雰囲気を変える

配色の6行を差し替えるだけです。

```css
/* 例：森の冒険ふうにする */
--c-bg:          #14261c;
--c-bg-deep:     #0b1712;
--c-surface:     #1e3a2a;
--c-surface-2:   #2a4d38;
--c-border:      #4e7a5c;
--c-accent:      #ffd166;
```

### 文字をもっと大きくする

`--font-scale` の3段階を変えます。

```css
html[data-font="large"] { --font-scale: 1.5; }   /* 既定は 1.25 */
```

個別のサイズを変えたい場合はこちら。

```css
--fs-base: calc(1.25rem * var(--font-scale));  /* 本文 20px */
--fs-xl:   calc(2rem    * var(--font-scale));  /* 問題文 32px */
--fs-2xl:  calc(2.5rem  * var(--font-scale));  /* 答え 40px */
```

### ボタンを大きくする

```css
--tap-min: 72px;   /* 既定 64px。WCAG 2.5.5 の下限は 44px */
```

### 角ばった見た目にする

```css
--radius-sm: 0;
--radius:    0;
--radius-lg: 0;
```

地図の県境の太さは `styles/components.css` の `.map-view .pref` で決めています。
`vector-effect: non-scaling-stroke` を付けてあるので、
拡大しても線の太さは変わりません。

### 地方の色を変える

```css
--c-region-kanto: #fcd34d;
```

地図・図鑑・敵の色・進行率バーがすべて同じ変数を見ているので、1か所で揃います。

---

## アニメーションを止める

OS 側で「視差効果を減らす」が有効なら自動で止まります。
アプリ内の設定「うごき → すくなめ」でも止まります。

手で全部止めたい場合は、

```css
:root {
  --dur-fast: 1ms;
  --dur:      1ms;
  --dur-slow: 1ms;
}
```

---

## 守ってほしいこと

### 判定を「色だけ」で表さない

○△×は **色・形・文字の3つ** で示しています。

```html
<div class="judge judge--maru">
  <div class="judge__mark">○</div>     <!-- 形 -->
  <div class="judge__text">せいかい！</div>  <!-- 文字 -->
</div>                                  <!-- 色はCSSクラス -->
```

色を変えるのは自由ですが、**形と文字は消さないでください。**
色の見え方は人によって違い、色だけに意味を持たせると伝わらない子が出ます。
（WCAG 1.4.1「色の使用」）

### タップ領域を 44px より小さくしない

`--tap-min` を下げると、小学生の指では押しまちがえが増えます。

### 文字と背景のコントラストを保つ

背景を明るくしたら、`--c-text` を暗い色に変えてください。
本文で 4.5:1、大きい文字で 3:1 が目安です（WCAG 1.4.3）。

### ふりがなを消さない

`rt` を CSS で非表示にするのは設定（`html[data-furigana="off"]`）だけにしてください。
既定では表示されている必要があります。

---

## レイアウトを変える

各画面のレイアウトは `styles/screens.css` にあります。
横向き（iPad）を主とし、縦向き・スマホでは1カラムに折り返しています。

```css
.quiz-screen__body {
  grid-template-columns: minmax(280px, 38%) 1fr;   /* 地図 | 手書き欄 */
}

@media (max-width: 900px), (orientation: portrait) {
  .quiz-screen__body {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(140px, 30dvh) 1fr;   /* 地図を上、手書きを下 */
  }
}
```

**手書き欄は必ず画面の下側に置いてください。**
上に置くと、書いている手で問題文や地図が隠れます。

高さの単位は `dvh` を使っています。`vh` だと Safari の URL バーが
出入りするたびにレイアウトが飛び跳ねます。

---

## 手書き欄の見た目

`styles/components.css` の `.pad`、実際の罫線は
`src/ui/components/handwriting-pad.js` の `#drawGrid()` で描いています。

```js
ctx.fillStyle = "#fffdf7";     // 紙の色
ctx.strokeStyle = "#d8d3c4";   // 中心の点線ガイド
ctx.strokeStyle = "#b9b2a0";   // マスの枠
```

紙のドリルに近い色にしてあります。ここを暗い色にすると
「画面に書いている」感じが強くなり、書き心地が変わります。
