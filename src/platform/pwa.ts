export const registerNightjarServiceWorker = () => {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js').then((registration) => {
      const announceWaiting = () => {
        if (registration.waiting) window.dispatchEvent(new CustomEvent('nightjar:update-available'));
      };
      announceWaiting();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('nightjar:update-available'));
          }
        });
      });
    }).catch(() => {
      // PWA enhancement must never block Nightjar.
    });
  });
};
