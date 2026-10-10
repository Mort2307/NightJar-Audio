import { useEffect, useState } from 'react';
import { Download, RefreshCw, Smartphone, WifiOff, X } from 'lucide-react';
import { applyNightjarUpdate } from '../platform/pwa';

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const INSTALL_DISMISS_KEY = 'nightjar.install-dismiss-until.v1';
const INSTALL_DISMISS_DAYS = 7;
const readDismissedUntil = () => {
  try {
    return Number(window.localStorage.getItem(INSTALL_DISMISS_KEY) ?? 0);
  } catch {
    return 0;
  }
};

export default function ProductExperience({ allowInstall = false }: { allowInstall?: boolean }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<DeferredPrompt | null>(null);
  const [installing, setInstalling] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [showManualSteps, setShowManualSteps] = useState(false);
  const [dismissedInstall, setDismissedInstall] = useState(() => readDismissedUntil() > Date.now());
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
    const onInstalled = () => {
      setStandalone(true);
      setInstallPrompt(null);
      setInstalling(false);
    };
    const onUpdate = () => setUpdateReady(true);
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayMode = () => setStandalone(Boolean(displayMode?.matches) || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onInstall);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('nightjar:update-available', onUpdate);
    displayMode?.addEventListener?.('change', onDisplayMode);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onInstall);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('nightjar:update-available', onUpdate);
      displayMode?.removeEventListener?.('change', onDisplayMode);
    };
  }, []);

  const dismiss = () => {
    setDismissedInstall(true);
    try {
      window.localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now() + INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000));
    } catch {
      // Dismiss still takes effect for the current browser session.
    }
  };

  const install = async () => {
    if (!installPrompt || !allowInstall || standalone || installing) return;
    setInstalling(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === 'accepted') {
        // Installed state is confirmed independently by appinstalled/display-mode.
        dismiss();
      }
    } catch {
      // A rejected browser prompt must not crash the application. Manual
      // browser-menu instructions are always available.
      setInstallPrompt(null);
      setShowManualSteps(true);
    } finally {
      setInstalling(false);
    }
  };

  const showInstall = allowInstall && online && !standalone && !dismissedInstall;

  return <>
    {showInstall && <section className="nj-install-invitation" aria-labelledby="nj-install-heading">
      <div className="nj-install-invitation-icon"><Smartphone size={23} aria-hidden="true" /></div>
      <div className="nj-install-invitation-copy">
        <span className="nj-install-invitation-eyebrow">NIGHTJAR ON YOUR DEVICE</span>
        <h2 id="nj-install-heading">Take Nightjar with you.</h2>
        <p>Install Nightjar on your home screen for a more convenient, app-like experience. No extra account or download fee.</p>
        <div className="nj-install-invitation-actions">
          {installPrompt
            ? <button type="button" className="primary-button" disabled={installing} onClick={() => void install()}><Download size={16}/>{installing ? 'Opening installer…' : 'Install Nightjar'}</button>
            : <button type="button" className="primary-button" aria-expanded={showManualSteps} aria-controls="nj-install-steps" onClick={() => setShowManualSteps((previous) => !previous)}><Download size={16}/>How to install</button>}
          {installPrompt && <button type="button" className="secondary-button" aria-expanded={showManualSteps} aria-controls="nj-install-steps" onClick={() => setShowManualSteps((previous) => !previous)}>Browser instructions</button>}
        </div>
        {showManualSteps && <div className="nj-install-instructions" id="nj-install-steps">
          <strong>Install from your browser</strong>
          <p>Open your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>. On iPhone Safari, choose <b>Share → Add to Home Screen</b>. The exact wording varies by browser.</p>
        </div>}
      </div>
      <button type="button" className="nj-install-dismiss icon-button" onClick={dismiss} aria-label="Remind me about installing Nightjar later"><X size={19}/></button>
    </section>}
    <div className="nj-product-status" aria-live="polite">
      {!online && <div className="nj-status-banner offline"><WifiOff size={15}/><span><strong>Offline mode</strong> Nightjar will reconnect automatically. Protected and account data are never cached for offline reading.</span></div>}
      {updateReady && <div className="nj-status-banner update"><RefreshCw size={15}/><span><strong>Nightjar update ready.</strong> Apply the deployed build using Nightjar’s cache-safe updater.</span><button type="button" onClick={() => void applyNightjarUpdate()}>Update now</button></div>}
    </div>
  </>;
}
