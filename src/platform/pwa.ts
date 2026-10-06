export type NightjarUpdateStatus = {
  supported: boolean;
  currentBuildId: string;
  currentBuiltAt: string;
  latestBuildId: string | null;
  latestBuiltAt: string | null;
  updateAvailable: boolean;
};

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

export const checkNightjarUpdate = async (): Promise<NightjarUpdateStatus> => {
  const base: NightjarUpdateStatus = {
    supported: 'serviceWorker' in navigator,
    currentBuildId: __NIGHTJAR_BUILD_ID__,
    currentBuiltAt: __NIGHTJAR_BUILT_AT__,
    latestBuildId: null,
    latestBuiltAt: null,
    updateAvailable: false,
  };

  try {
    const response = await fetch('/version.json?nightjar-update-check=' + Date.now(), {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });
    if (!response.ok) return base;
    const data = await response.json() as { buildId?: unknown; builtAt?: unknown };
    const latestBuildId = typeof data.buildId === 'string' ? data.buildId : null;
    const latestBuiltAt = typeof data.builtAt === 'string' ? data.builtAt : null;
    return {
      ...base,
      latestBuildId,
      latestBuiltAt,
      updateAvailable: Boolean(latestBuildId && latestBuildId !== __NIGHTJAR_BUILD_ID__),
    };
  } catch {
    return base;
  }
};

export const applyNightjarUpdate = async () => {
  try {
    try {
      window.sessionStorage.setItem('nightjar.update-applied.v1', new Date().toISOString());
    } catch {
      // Update still proceeds if session storage is unavailable.
    }

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(async (registration) => {
        try { await registration.update(); } catch { /* continue with forced reset */ }
        try { registration.waiting?.postMessage({ type: 'SKIP_WAITING' }); } catch { /* optional */ }
        try { await registration.unregister(); } catch { /* reload still continues */ }
      }));
    }

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } finally {
    const url = new URL(window.location.href);
    url.searchParams.set('nightjar-refresh', Date.now().toString());
    window.location.replace(url.toString());
  }
};
