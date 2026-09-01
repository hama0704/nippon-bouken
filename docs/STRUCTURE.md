# フォルダ構成と、どこに何があるか

## 全体の考え方

このアプリは4つの層に分かれていて、**依存は上から下への一方向だけ**です。
下の層は上の層を知りません。だから下の層だけを取り替えたり、
上の層だけを作り直したりできます。

```
  ui/        画面・見た目・アニメーション
   ↓
  engine/    ゲームのルール（出題・採点・成長・戦闘・分析）
   ↓                     ※ 都道府県のことを一切知らない
  content/   教材データ（47都道府県・地図の形・敵）
   ↓
  core/      土台（状態・保存・画面切替・イベント）
  platform/  ブラウザ機能（文字認識・音）
  utils/     小さな道具（かな処理・乱数・DOM）
```

いちばん大事なのは **engine/ が都道府県を知らない** ことです。
engine が扱うのは「Subject（出題対象）」という抽象的な形だけなので、
世界地図や歴史人物のデータを渡せば、そのまま別の教材になります。

---

## ファイル一覧

```
prefecture-rpg/
├── index.html                  唯一のHTML。中身はJSが組み立てる
├── manifest.webmanifest        ホーム画面に追加したときの設定
├── sw.js                       オフライン用のService Worker
├── package.json                テスト実行用（依存パッケージは0）
│
├── styles/
│   ├── tokens.css              ★ 色・文字サイズ・余白の定義。見た目の元栓
│   ├── base.css                リセット・ふりがな・フォーカス表示
│   ├── components.css          ボタン・パネル・ゲージ・手書き欄・地図
│   └── screens.css             各画面のレイアウト
│
├── assets/icons/               PWA用アイコン（日本列島のドット絵）
│
├── tests/
│   ├── test-runner.js          小さなテストランナー（依存なし）
│   ├── tests.js                ★ 74件の回帰テスト本体
│   ├── run.html                ブラウザで実行
│   └── run-node.mjs            コマンドラインで実行
│
├── tools/
│   ├── build-map.mjs           国土地理院のデータ → 地図（アプリ本体では使わない）
│   ├── preview-map.mjs         生成した地図を目で確かめる SVG を出す
│   └── map-preview.svg         その出力。地図を直したらまずこれを見る
│
├── docs/                       このフォルダ
│
└── src/
    ├── main.js                 起動。画面の登録と組み立てだけを行う
    │
    ├── core/                   ── 土台 ──────────────────────
    │   ├── event-bus.js        「正解した」などの出来事を配る仕組み
    │   ├── store.js            ★ 状態の唯一の置き場。書き換えは update() のみ
    │   ├── save-manager.js     localStorage への保存・読込・壊れたデータの復旧
    │   └── screen-router.js    画面の切り替えと「もどる」
    │
    ├── engine/                 ── ゲームのルール（教材に依存しない）──
    │   ├── question-engine.js  次に何を出すか（重みづけ・地方しぼり・復習）
    │   ├── scoring-engine.js   ★ ○△×の判定
    │   ├── progress-engine.js  ★ 経験値・レベル・ステータス
    │   ├── srs-engine.js       忘却曲線（1/3/7/14/30日）
    │   ├── battle-engine.js    戦闘の進行・地方制覇・魔王
    │   └── analytics-engine.js 正答率・習熟度・にがて抽出・CSV書き出し
    │
    ├── content/                ── 教材データ ──────────────────
    │   ├── prefectures.js      ★ 47都道府県のマスターデータ
    │   ├── pref-paths.js       ★ 地図の形（本物の白地図。tools/build-map.mjs が生成）
    │   ├── regions.js          9地方の定義と色
    │   ├── enemies.js          敵の定義（強さは地方の順番から自動計算）
    │   └── prefecture-pack.js  上記を engine が読める形に変換するアダプタ
    │
    ├── platform/               ── ブラウザの機能 ───────────────
    │   ├── audio-manager.js    効果音（Web Audioで合成。音源ファイル0個）
    │   └── recognition/
    │       ├── recognizer.js         ★ 文字認識の差し込み口（インターフェース）
    │       ├── stroke-recognizer.js  既定エンジン（フォントのお手本と見くらべる）
    │       ├── selfcheck-recognizer.js 自分で丸つけするモード
    │       └── README.md             差し替え手順
    │
    ├── map/
    │   └── map-renderer.js     地図SVGの組み立て・色分け・ズーム・指での操作
    │
    ├── ui/
    │   ├── screens/            画面ごとに1ファイル
    │   │   ├── title-screen.js
    │   │   ├── mode-screen.js
    │   │   ├── adventure-screen.js
    │   │   ├── quiz-screen.js      ★ 学習の中心。1問の流れ全体
    │   │   ├── result-panel.js     こたえあわせの表示
    │   │   ├── dex-screen.js
    │   │   ├── records-screen.js
    │   │   └── settings-screen.js
    │   └── components/         画面をまたいで使う部品
    │       ├── handwriting-pad.js  ★ マス目の手書き入力
    │       ├── self-check.js       自分で丸つけする画面
    │       ├── battle-panel.js     敵とHPの表示・演出
    │       └── enemy-art.js        敵の絵（インラインSVG）
    │
    └── utils/
        ├── dom.js              el() で要素を作る小さなヘルパ
        ├── kana.js             ★ かな変換・正規化・「認める書き方」の組み立て
        └── random.js           乱数（たねを固定して再現できる）
```

★ = さわる機会が多い、または特に重要なファイル

---

## 「これを直したい」逆引き

| やりたいこと | 見るファイル |
|---|---|
| 色や文字の大きさを変える | `styles/tokens.css` |
| ○△×のきまりを変える | `src/engine/scoring-engine.js` |
| 経験値の数字を変える | `src/engine/progress-engine.js` の `EXP_TABLE` |
| 復習の間隔を変える | `src/engine/srs-engine.js` の `INTERVALS_DAYS` |
| 敵を強く／弱くする | `src/content/enemies.js` の `BALANCE` |
| 敵を追加する | `src/content/enemies.js` ＋ `src/ui/components/enemy-art.js` |
| 県のデータ（名産など）を直す | `src/content/prefectures.js` |
| 地図を作り直す | `tools/build-map.mjs`（→ docs/CUSTOMIZE.md） |
| ヒントの文章を変える | `src/engine/question-engine.js` の `buildHints` |
| 文字認識を差し替える | `src/platform/recognition/README.md` |
| 効果音を変える | `src/platform/audio-manager.js` の `SOUNDS` |

---

## 覚えておくとよい約束ごと

**状態を書き換えるときは、かならず `store.update()` を通す。**
直接 `store.player.exp = 100` と書くと、保存されず、画面にも反映されません。

```js
store.update((save) => { save.player.exp += 100; });
```

**画面を閉じるときは `destroy()` で後始末をする。**
イベント購読やタイマーを残すと、遊ぶほど動作が重くなります。

**出来事は EventBus に流す。**
「正解したら音を鳴らす」を画面に書くと、音を消したいときに画面を直すことになります。
`bus.emit(Events.ANSWER_JUDGED, ...)` を流せば、音の担当が勝手に反応します。

**ファイルを追加したら `sw.js` の `PRECACHE_URLS` にも追加する。**
忘れるとオフラインでそのファイルだけ読み込めません。
