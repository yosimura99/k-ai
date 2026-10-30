/**
 * sw.js — Service worker: lưu đệm vỏ ứng dụng để mở được khi ngoại tuyến.
 * KHÔNG BAO GIỜ lưu đệm lời gọi API: chỉ xử lý yêu cầu GET cùng nguồn (same-origin).
 * Đổi CACHE khi phát hành bản mới để trình duyệt nạp lại tệp.
 */
const CACHE = 'kai-shell-v6';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './system-prompt.js',
  './css/style.css',
  './js/app.js',
  './js/config.js',
  './js/storage.js',
  './js/log.js',
  './js/ui.js',
  './js/chat.js',
  './js/image.js',
  './js/fal.js',
  './js/pollinations.js',
  './js/settings.js',
  './js/lock.js',
  './icons/icon-64.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './apple-touch-icon.png',
  './favicon.ico',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* Mạng trước, lùi về bộ đệm khi ngoại tuyến — để sửa system-prompt.js là thấy ngay. */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // API & tài nguyên ngoài: không đụng tới
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
      .then((r) => r || Response.error()),
  );
});
