// Service Worker — オフライン対応 & PWA必須ファイル
const CACHE_NAME = 'pomoart-v7';
const CACHED_URLS = ['/', '/index.html', '/icon-192.png', '/icon-512.png', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHED_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // 古いキャッシュを削除
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // 外部リソース
  if (url.origin !== self.location.origin) {
    // Pollinations.ai画像生成は時間がかかるので長いタイムアウト＋キャッシュ
    if (url.hostname === 'image.pollinations.ai') {
      e.respondWith(
        caches.match(e.request).then((cached) => {
          if (cached) return cached;
          return fetch(e.request).then((resp) => {
            if (resp.ok) {
              const clone = resp.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
            }
            return resp;
          }).catch(() => new Response('', { status: 408 }));
        })
      );
      return;
    }
    // その他の外部リソース（Puter.js等）は2秒タイムアウト
    e.respondWith(
      Promise.race([
        fetch(e.request).catch(() => new Response('', { status: 408 })),
        new Promise((resolve) => setTimeout(() => resolve(new Response('', { status: 408 })), 2000))
      ])
    );
    return;
  }

  // 自サイトのリソース: キャッシュ優先 → ネットワークフォールバック
  // （保護者制限等でネットワークが制限されてもキャッシュから即座に起動できる）
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) {
        // キャッシュがあれば即座に返し、バックグラウンドで更新
        fetch(e.request).then((resp) => {
          if (resp.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resp));
          }
        }).catch(() => {});
        return cached;
      }
      // キャッシュがなければネットワーク（3秒タイムアウト）
      return Promise.race([
        fetch(e.request).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return resp;
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]).catch(() => {
        // オフラインで初回アクセスの場合、最低限のレスポンスを返す
        return new Response('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#0f0c29;color:#e8e8f0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;text-align:center"><div><p style="font-size:48px">🍅</p><p>オフラインです。<br>ネットワーク接続時に再度開いてください。</p></div></body></html>', {
          headers: { 'Content-Type': 'text/html' }
        });
      });
    })
  );
});
