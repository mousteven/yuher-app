/* 羽禾 App 的 Service Worker。
   只做兩件事：讓 Android 認得這是可安裝的 App，以及外殼本身斷網也打得開。
   真正的系統在 script.google.com，那邊的請求一律不碰——
   服務紀錄是即時資料，快取只會讓人看到舊的。 */
const CACHE = 'yuher-shell-v1';
const SHELL = ['./', './index.html', './manifest.json',
               './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  let u;
  try { u = new URL(e.request.url); } catch (err) { return; }
  if (u.origin !== location.origin) return;      // Apps Script 的請求直接放行
  if (e.request.method !== 'GET') return;
  // 先連網、拿不到才用快取——這樣改了外殼下次打開就是新的
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
