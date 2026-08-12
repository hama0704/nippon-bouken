/**
 * sw.js ― Service Worker。オフラインで遊べるようにする。
 *
 * ■ 方針: キャッシュ優先（cache first）
 *   この教材は内容が動的に変わらないので、
 *   一度取り込んだファイルはネットワークを見ずにキャッシュから返す。
 *   校内Wi-Fiが不安定でも、機内モードでも、同じ速さで動く。
 *
 * ■ 更新のしかた
 *   ファイルを直したら、下の CACHE_VERSION の数字を1つ上げる。
 *   これを忘れると、児童の端末に古い版が residual として残り続ける。
 *   （詳しくは docs/PWA.md）
 */

const CACHE_VERSION = "v2";
const CACHE_NAME = `nippon-bouken-${CACHE_VERSION}`;

/**
 * 最初に取り込むファイル。
 * ES Modules は import を辿って個別に読み込まれるため、
 * すべてのモジュールをここに列挙する必要がある。
 * ファイルを追加したら、ここにも追加すること。
 */
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",

  "./styles/tokens.css",
  "./styles/base.css",
  "./styles/components.css",
  "./styles/screens.css",

  "./src/main.js",

  "./src/core/event-bus.js",
  "./src/core/store.js",
  "./src/core/save-manager.js",
  "./src/core/screen-router.js",

  "./src/engine/question-engine.js",
  "./src/engine/scoring-engine.js",
  "./src/engine/progress-engine.js",
  "./src/engine/srs-engine.js",
  "./src/engine/battle-engine.js",
  "./src/engine/analytics-engine.js",

  "./src/content/prefectures.js",
  "./src/content/pref-shapes.js",
  "./src/content/regions.js",
  "./src/content/enemies.js",
  "./src/content/prefecture-pack.js",

  "./src/platform/audio-manager.js",
  "./src/platform/recognition/recognizer.js",
  "./src/platform/recognition/stroke-recognizer.js",
  "./src/platform/recognition/selfcheck-recognizer.js",

  "./src/map/map-renderer.js",
  "./src/map/shape-builder.js",

  "./src/ui/screens/title-screen.js",
  "./src/ui/screens/mode-screen.js",
  "./src/ui/screens/adventure-screen.js",
  "./src/ui/screens/quiz-screen.js",
  "./src/ui/screens/result-panel.js",
  "./src/ui/screens/dex-screen.js",
  "./src/ui/screens/records-screen.js",
  "./src/ui/screens/settings-screen.js",

  "./src/ui/components/answer-text.js",
  "./src/ui/components/handwriting-pad.js",
  "./src/ui/components/self-check.js",
  "./src/ui/components/battle-panel.js",
  "./src/ui/components/enemy-art.js",

  "./src/utils/dom.js",
  "./src/utils/kana.js",
  "./src/utils/random.js",

  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-180.png",
  "./assets/icons/icon-maskable-512.png",
];

/** 取り込み。1つでも失敗したら全体を諦める、ということはしない */
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // addAll は1つでも 404 だと全部失敗する。
    // アイコンが無い等で「オフラインがまったく効かない」状態になるのを避け、
    // 取れたものだけ確実にキャッシュする。
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: "reload" }));
      } catch (error) {
        console.warn("[sw] キャッシュできませんでした:", url, error);
      }
    }));
    // 新しい版をすぐ有効にする
    await self.skipWaiting();
  })());
});

/** 古い版のキャッシュを片づける */
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith("nippon-bouken-") && name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

/**
 * 取り出し。
 * キャッシュにあればそれを返し、無ければネットワークへ。
 * 取れたものは次回のためにキャッシュへ入れておく。
 */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // GET 以外と、別ドメインへの通信には手を出さない
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: false });
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      // オフラインで未キャッシュのものを求められた場合。
      // 画面遷移の要求なら、せめてトップページを返す。
      if (request.mode === "navigate") {
        const fallback = await caches.match("./index.html");
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
