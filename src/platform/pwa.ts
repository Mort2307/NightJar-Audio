export type NightjarUpdateStatus = {
  supported: boolean;
  currentBuildId: string;
  currentBuiltAt: string;
  currentSourceCommit: string | null;
  latestSourceCommit: string | null;
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
    currentSourceCommit: __NIGHTJAR_SOURCE_COMMIT__,
    latestSourceCommit: null,
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
    const data = await response.json() as { buildId?: unknown; builtAt?: unknown; sourceCommit?: unknown };
    const latestBuildId = typeof data.buildId === 'string' ? data.buildId : null;
    const latestBuiltAt = typeof data.builtAt === 'string' ? data.builtAt : null;
    const latestSourceCommit = typeof data.sourceCommit === 'string' ? data.sourceCommit : null;
    return {
      ...base,
      latestBuildId,
      latestBuiltAt,
      latestSourceCommit,
      updateAvailable: Boolean((latestBuildId && latestBuildId !== __NIGHTJAR_BUILD_ID__) ||
        (latestSourceCommit && __NIGHTJAR_SOURCE_COMMIT__ && latestSourceCommit !== __NIGHTJAR_SOURCE_COMMIT__)),
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

    // Preserve registration and push subscriptions while replacing the app shell.
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration('/');
      if (registration) {
        try { await registration.update(); } catch { /* reload still proceeds */ }
        try { registration.waiting?.postMessage({ type: 'SKIP_WAITING' }); } catch { /* optional */ }
      }
    }

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('nightjar-')).map(key => caches.delete(key)));
    }
  } finally {
    const url = new URL(window.location.href);
    url.searchParams.set('nightjar-refresh', Date.now().toString());
    window.location.replace(url.toString());
  }
};
