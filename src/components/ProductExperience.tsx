import { useEffect, useState } from 'react';
import { Download, RefreshCw, WifiOff, X } from 'lucide-react';
import { applyNightjarUpdate } from '../platform/pwa';

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function ProductExperience({ allowInstall = false }: { allowInstall?: boolean }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<DeferredPrompt | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [dismissedInstall, setDismissedInstall] = useState(false);
  const [standalone, setStandalone] = useState(() =>
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as DeferredPrompt);
    };
    const onUpdate = () => setUpdateReady(true);
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayMode = () => setStandalone(Boolean(displayMode?.matches) || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onInstall);
    window.addEventListener('nightjar:update-available', onUpdate);
    displayMode?.addEventListener?.('change', onDisplayMode);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onInstall);
      window.removeEventListener('nightjar:update-available', onUpdate);
      displayMode?.removeEventListener?.('change', onDisplayMode);
    };
  }, []);

  const install = async () => {
    if (!installPrompt || !allowInstall || standalone) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
  };

  return <div className="nj-product-status" aria-live="polite">
    {!online && <div className="nj-status-banner offline"><WifiOff size={15}/><span><strong>Offline mode</strong> Nightjar will reconnect automatically. Protected and account data are never cached for offline reading.</span></div>}
    {updateReady && <div className="nj-status-banner update"><RefreshCw size={15}/><span><strong>Nightjar update ready.</strong> Apply the deployed build using Nightjar’s cache-safe updater.</span><button onClick={() => void applyNightjarUpdate()}>Update now</button></div>}
    {online && allowInstall && !standalone && installPrompt && !dismissedInstall && <div className="nj-status-banner install"><Download size={15}/><span><strong>Install Nightjar</strong> for an app-like launch experience on this device.</span><button onClick={() => void install()}>Install</button><button className="icon-button" onClick={() => setDismissedInstall(true)} aria-label="Dismiss install prompt"><X size={14}/></button></div>}
  </div>;
}
