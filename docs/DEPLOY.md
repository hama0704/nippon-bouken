# GitHub Pages への公開手順

インターネットに公開して、児童がURLから使えるようにします。
サーバーの契約も費用も必要ありません。

---

## A. このリポジトリの一部として公開する場合

いまこの教材は既存プロジェクトの中の `prefecture-rpg/` フォルダにあります。
サブフォルダのまま公開するのがいちばん簡単です。

### 1. リポジトリに反映する

```bash
git add prefecture-rpg
git commit -m "都道府県RPGを追加"
git push
```

### 2. GitHub Pages を有効にする

1. GitHub でリポジトリを開く
2. **Settings** → 左メニューの **Pages**
3. **Source** を「Deploy from a branch」にする
4. **Branch** を `main`、フォルダを `/ (root)` にして **Save**

数分待つと `https://ユーザー名.github.io/リポジトリ名/` が有効になります。

### 3. アプリのURL

```
https://ユーザー名.github.io/リポジトリ名/prefecture-rpg/
```

このURLを児童に配ります。QRコードにすると入力の手間が省けます。

---

## B. 教材だけを独立したリポジトリで公開する場合

学校で配りやすいよう、短いURLにしたいときはこちらです。

```bash
cd prefecture-rpg
git init
git add .
git commit -m "にっぽん冒険記"
git branch -M main
git remote add origin https://github.com/ユーザー名/nippon-bouken.git
git push -u origin main
```

そのあと Settings → Pages で `main` / `/ (root)` を選びます。
URLは `https://ユーザー名.github.io/nippon-bouken/` になります。

---

## 公開したら確かめること

- [ ] URLを開いてタイトル画面が出る
- [ ] 「ぼうけんに でる」から問題まで進める
- [ ] iPad の Safari で開き、ホーム画面に追加できる
- [ ] ホーム画面のアイコンから起動すると全画面になる
- [ ] 機内モードにしても遊べる（一度開いたあと）

---

## うまくいかないとき

### 画面が真っ白

ブラウザの開発者ツールのコンソールを見てください。

**`Failed to load module script` と出ている場合**
拡張子 `.js` が正しく配信されていません。GitHub Pages では通常起こりませんが、
学校のサーバーに置いた場合は、`.js` を `text/javascript` として返す設定が必要です。

**`404` が並んでいる場合**
パスが合っていません。このアプリはすべて相対パスで書いてあるので、
フォルダごと丸ごと置けば動きます。中のファイルだけを移動していないか確認してください。

### 更新したのに古いまま

`sw.js` の `CACHE_VERSION` を上げ忘れています。
→ [PWA.md](PWA.md) の「更新が反映されないときの直し方」を参照。

### ホーム画面に追加のメニューが出ない

Safari 以外のブラウザで開いています。iOS では Safari が必要です。

---

## 校内サーバーに置く場合

`prefecture-rpg/` フォルダをまるごとコピーするだけです。ビルドは不要です。

ただし **https でないと** Service Worker が動かず、
オフライン機能とホーム画面への追加が使えません。
アプリ自体は http でも動作します。

---

## 児童に配るときの案内文（例）

> **にっぽん冒険記のはじめかた**
>
> 1. Safari で下のURLをひらきます
>    `https://…`
> 2. 画面の「共有」ボタン（□に↑のマーク）をおします
> 3. 「ホーム画面に追加」をえらびます
> 4. ホーム画面にできたアイコンから、いつでもあそべます
>
> ※ インターネットにつながっていなくてもあそべます
> ※ きろくはこのiPadの中にだけのこります
