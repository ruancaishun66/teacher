/* 注册离线缓存。只在 https 或本机 localhost 生效。 */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        const activate = (worker) => {
          if (worker) worker.postMessage({ type: 'SKIP_WAITING' });
        };
        registration.update().catch(() => {});
        activate(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) activate(worker);
          });
        });
      })
      .catch(() => {});
  });
}
