/**
 * sw.js ― Service Worker。オフラインで遊べるようにする。
 *
 * ■ 方針: まずキャッシュを返し、裏で新しくする
 *   一度取り込んだファイルはキャッシュから即座に返す。
 *   校内Wi-Fiが不安定でも、機内モードでも、同じ速さで動く。
 *   同時に裏でネットワークからも取り直すので、
 *   ファイルを直して公開すれば、次に開いたときに自動で新しくなる。
 *
 * ■ 更新のしかた
 *   push するだけでよい。児童の端末は次の起動で新しい版になる。
 *   下の CACHE_VERSION は、消したファイルを一掃したいときだけ上げる。
 *   （詳しくは docs/PWA.md）
 */

const CACHE_VERSION = "v5";
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
  "./src/content/pref-paths.js",
  "./src/content/regions.js",
  "./src/content/enemies.js",
  "./src/content/prefecture-pack.js",

  "./src/platform/audio-manager.js",
  "./src/platform/recognition/recognizer.js",
  "./src/platform/recognition/stroke-recognizer.js",
  "./src/platform/recognition/selfcheck-recognizer.js",

  "./src/map/map-renderer.js",

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
 *
 * ■ 「すぐ返す」と「新しくする」を両立させる
 *   キャッシュにあればまずそれを返す（速い・オフラインでも動く）。
 *   同時に、裏でネットワークからも取り直してキャッシュを更新しておく。
 *   こうすると、次にアプリを開いたときには自動で新しい版になる。
 *
 * ■ なぜこうしたか
 *   以前は「キャッシュにあれば返して終わり」だったため、
 *   CACHE_VERSION を上げ忘れると児童の端末が古い版のまま固定された。
 *   先生の端末では直って見えるのに教室では直らない、という
 *   いちばん原因を探しにくい状態になる。
 *   人が毎回忘れずに数字を上げる、という前提に頼るのをやめた。
 *
 *   （CACHE_VERSION は今も有効。消したファイルを一掃したいときに上げる）
 */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // GET 以外と、別ドメインへの通信には手を出さない
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: false });

    // 裏での取り直し。失敗しても表示には影響させない（オフラインが正常系）
    const refresh = fetch(request)
      .then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      })
      .catch(() => null);

    if (cached) {
      // 待たずに返す。更新は次回の起動から反映される
      event.waitUntil(refresh);
      return cached;
    }

    const response = await refresh;
    if (response) return response;

    // オフラインで、まだキャッシュにも無いものを求められた場合。
    // 画面遷移の要求なら、せめてトップページを返す。
    if (request.mode === "navigate") {
      const fallback = await caches.match("./index.html");
      if (fallback) return fallback;
    }
    return new Response("オフラインのため読み込めませんでした", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  })());
});
