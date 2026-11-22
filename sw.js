/* 顺势 · 离线缓存：先用上次看过的版本立即打开，再在后台更新。 */
const CACHE = 'shunshi-pwa-v45';
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
      // 逐个下载并限时；某个文件卡住时不让整个新缓存安装失败。
      .then((cache) => Promise.all(CORE.map((url) =>
        fetchWithTimeout(url, 8000)
          .then((response) => (response && response.ok ? cache.put(url, response) : null))
          .catch(() => null)
      )))
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

/* 页面发现新版本在等待时，会发消息让它立刻接管，不用等所有标签页关掉。 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* 网络偶尔会卡住不返回；最多等 8 秒，超时就先用上次缓存，别让页面一直转圈。 */
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('network timeout'));
    }, ms);
    fetch(request).then(
      (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  /* OCR 引擎和 PDF 渲染包体积大，交给浏览器普通缓存，不塞进离线缓存。 */
  if (/\/vendor\/(tesseract|pdf)/.test(url.pathname)) return;

  event.respondWith((async () => {
    // 先找完全相同的地址。只有不带版本号的页面才退回旧缓存；
    // 带 ?v= 的新脚本必须直接走网络，否则新版本号会被旧缓存挡住，
    // 老师更新后第一次打开仍看到旧界面。
    const cached = (await caches.match(request))
      || (url.search ? null : await caches.match(request, { ignoreSearch: true }));
    const network = fetchWithTimeout(request, 8000)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => null);
    if (cached) {
      // 先用旧缓存立即打开，再在后台悄悄换成最新版；不要为了“取最新”让老师每次干等网络。
      event.waitUntil(network.catch(() => null));
      return cached;
    }
    const response = await network;
    if (response) return response;
    if (request.mode === 'navigate') {
      return (await caches.match('./index.html')) || Response.error();
    }
    return Response.error();
  })());
});
