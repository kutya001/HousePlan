/**
 * Установка на телефон / рабочий стол и работа без сети.
 * Service worker: сначала сеть (всегда свежая версия), при офлайне — кэш.
 */
export function setupPWA(app) {
  const pwa = {
    canInstall: false,
    deferred: null,
    async install() {
      if (!pwa.deferred) return;
      pwa.deferred.prompt();
      const { outcome } = await pwa.deferred.userChoice;
      if (outcome === 'accepted') app.toast('HousePlan установлен');
      pwa.deferred = null;
      pwa.canInstall = false;
    },
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pwa.deferred = e;
    pwa.canInstall = true;
  });

  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && secure) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker не зарегистрирован', err));
    });
  }
  return pwa;
}
