/* 顺势 · 离线缓存：联网时永远取最新，断网时用上次看过的版本。 */
const CACHE = 'shunshi-pwa-v26';
const CORE = [
  './',
  './index.html',
  './student.html',
  './teacher.html',
  './library.html',
  './guide.html',
  './portal.css',
  './portal.js',
  './pet-art.js',
  './student.js',
  './teacher.js',
  './teacher.css',
  './library.js',
  './question-visual.js',
  './insights.js',
  './insights-core.js',
  './guide.css',
  './grammar-data.js',
  './grammar-advanced.js',
  './grammar-extra.js',
  './word-examples.js',
  './pwa.js',
  './guide/img/add-student.webp',
  './guide/img/ai-ledger.png',
  './guide/img/ai-settings.webp',
  './guide/img/book-scheduler.png',
  './guide/img/daily-board.png',
  './guide/img/backup.webp',
  './guide/img/grammar-student.webp',
  './guide/img/grammar-teacher.png',
  './guide/img/home.webp',
  './guide/img/library.webp',
  './guide/img/pets-twenty.png',
  './guide/img/report-import.webp',
  './guide/img/student-breakdown.png',
  './guide/img/student-pet.webp',
  './guide/img/teacher-reading-pane.png',
  './guide/img/teacher-overview.png',
  './guide/img/teacher-students.webp',
  './guide/img/word-codes.png',
  './guide/img/word-context.png',
  './guide/img/word-dialog.webp',
  './guide/img/word-runner.webp',
  './logo.svg',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  /* OCR 引擎和 PDF 渲染包体积大，交给浏览器普通缓存，不塞进离线缓存。 */
  if (/\/vendor\/(tesseract|pdf)/.test(url.pathname)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => {
        if (hit) return hit;
        if (request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }))
  );
});
