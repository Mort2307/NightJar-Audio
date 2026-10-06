import { useEffect, useState } from 'react';
import { Download, RefreshCw, WifiOff, X } from 'lucide-react';
import { applyNightjarUpdate, checkNightjarUpdate } from '../platform/pwa';

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const installedDisplayMode = () => {
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
};

export default function ProductExperience() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<DeferredPrompt | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [dismissedInstall, setDismissedInstall] = useState(false);
  const [installed, setInstalled] = useState(installedDisplayMode);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void checkNightjarUpdate().then((status)=>setUpdateReady(status.updateAvailable)).catch(()=>undefined);
    };
    const onOffline = () => setOnline(false);
    const onInstall = (event: Event) => {
      if (installedDisplayMode()) return;
      event.preventDefault();
      setInstallPrompt(event as DeferredPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    const onUpdate = () => setUpdateReady(true);
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayMode = () => setInstalled(installedDisplayMode());

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onInstall);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('nightjar:update-available', onUpdate);
    displayMode?.addEventListener?.('change', onDisplayMode);

    if (navigator.onLine) {
      void checkNightjarUpdate().then((status)=>setUpdateReady(status.updateAvailable)).catch(()=>undefined);
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onInstall);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('nightjar:update-available', onUpdate);
      displayMode?.removeEventListener?.('change', onDisplayMode);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result=await installPrompt.userChoice.catch(() => null);
    if (result?.outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  };

  const update = async () => {
    setUpdating(true);
    await applyNightjarUpdate();
  };

  return <div className="nj-product-status" aria-live="polite">
    {!online && <div className="nj-status-banner offline"><WifiOff size={15}/><span><strong>Offline mode</strong> Nightjar will reconnect automatically. Protected and account data are never cached for offline reading.</span></div>}
    {updateReady && <div className="nj-status-banner update"><RefreshCw size={15}/><span><strong>Nightjar update ready.</strong> Refresh the app to replace old service-worker and cache state with the latest deployed build.</span><button disabled={updating} onClick={() => void update()}>{updating?'Updating…':'Update now'}</button></div>}
    {online && !installed && installPrompt && !dismissedInstall && <div className="nj-status-banner install"><Download size={15}/><span><strong>Install Nightjar</strong> for an app-like launch experience on this device.</span><button onClick={() => void install()}>Install</button><button className="icon-button" onClick={() => setDismissedInstall(true)} aria-label="Dismiss install prompt"><X size={14}/></button></div>}
  </div>;
}
