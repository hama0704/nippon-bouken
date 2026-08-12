# 手書き文字認識エンジンの差し替え方

このフォルダは「手書きを読み取る仕組み」だけを閉じ込めた場所です。
ゲーム本体は `recognizer.js` が決めた形しか知らないので、
**中身を丸ごと入れ替えても他のファイルは1行も直さずに済みます。**

## いま入っているエンジン

| id | ファイル | 中身 |
|---|---|---|
| `stroke` | `stroke-recognizer.js` | 既定。フォントで描いた「お手本」と画像として見くらべる。追加ダウンロード 0MB、オフラインで動作 |
| `selfcheck` | `selfcheck-recognizer.js` | 何も読まず、必ず子ども自身に○△×を選んでもらう |

設定画面で切り替えられます（保存先は `settings.recognizer`）。

## 新しいエンジンを足す手順

### 1. クラスを作る

```js
// src/platform/recognition/my-recognizer.js
import { Recognizer } from "./recognizer.js";

export class MyRecognizer extends Recognizer {
  static id = "my-engine";              // settings に保存される値
  static label = "○○エンジン";          // 設定画面に出る名前

  async init() {
    // モデルの読み込みなど。時間がかかってよい（初回の1回だけ呼ばれる）
  }

  async recognize({ cells, candidates }) {
    // cells      … マスごとの手書き。座標はマス内の 0..1
    // candidates … ありうる答えの一覧（例: 47都道府県名）
    return {
      text: "神奈川",          // いちばんあり得る読み取り結果
      confidence: 0.8,          // 0..1
      ranked: [{ text: "神奈川", score: 0.8 }],
      needsConfirmation: false, // true なら自己確認の画面が出る
    };
  }

  dispose() {}
}
```

### 2. 登録する

`src/main.js` に1行足すだけです。

```js
import { MyRecognizer } from "./platform/recognition/my-recognizer.js";
registerRecognizer(MyRecognizer);
```

これで設定画面の選択肢に現れます。

## 移行先の候補と注意点

### Google ML Kit Digital Ink Recognition
手書きに特化していて日本語の精度が高いのが利点です。
ただし Web 版が無く、iOS/Android のネイティブアプリか、
サーバ経由での呼び出しが必要になります。
**「サーバ不要」という前提を壊す**ので、採用するなら
オフライン時は `selfcheck` に落ちる作りにしてください。

### WebNN / ONNX Runtime Web
ブラウザ内で推論できるので前提を壊しません。
ETL文字データベース等で学習した小さなモデルを用意できれば、
本命の選択肢になります。モデルのサイズと初回ダウンロード時間に注意。

### Tesseract.js
導入は簡単ですが、**印刷された文字を読む道具**であり、
小学生の手書き漢字はほとんど読めません。
日本語データが十数MBあり、オフライン配布も重くなります。
検討はしましたが、この教材では見送っています。

## 既定エンジンの精度を上げたいとき

`stroke-recognizer.js` の上のほうにある定数を調整します。

| 定数 | 効果 |
|---|---|
| `TEMPLATE_FONTS` | お手本のフォント。教科書体を足すと子どもの字に近づく |
| `THRESHOLDS.confirmBelow` | 下げると自動採点が増え、上げると自己確認が増える |
| `THRESHOLDS.clearMargin` | 1位と2位の差の必要量。上げると慎重になる |
| `SIZE` | 特徴量の解像度。上げても精度はあまり変わらず遅くなる |

**大切なこと**：しきい値は必ず実際の児童の字で調整してください。
開発者の字で合わせると、教室では合いません。
自信度が低いときは自己確認に回るので、
「厳しめ（自己確認が多め）」に倒しておくほうが安全です。
