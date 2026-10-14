import { useEffect, useState } from 'react';
import { Download, RefreshCw, Smartphone, WifiOff, X } from 'lucide-react';
import { applyNightjarUpdate } from '../platform/pwa';
import { nightjarInstaller } from '../platform/nightjar-install';

const INSTALL_DISMISS_KEY = 'nightjar.install-dismiss-until.v1';
const INSTALL_DISMISS_DAYS = 7;
const readDismissedUntil = () => {
  try { return Number(window.localStorage.getItem(INSTALL_DISMISS_KEY) ?? 0); }
  catch { return 0; }
};
const installed = () => window.matchMedia?.('(display-mode: standalone)').matches === true ||
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
const isIOS = () => /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export default function ProductExperience({ allowInstall = false }: { allowInstall?: boolean }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [nativeReady, setNativeReady] = useState(() => nightjarInstaller.available());
  const [installing, setInstalling] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [showManualSteps, setShowManualSteps] = useState(false);
  const [dismissedInstall, setDismissedInstall] = useState(() => readDismissedUntil() > Date.now());
  const [standalone, setStandalone] = useState(installed);
  const [installationMessage, setInstallationMessage] = useState('');

  const dismiss = () => {
    setDismissedInstall(true);
    try { window.localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now() + INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000)); }
    catch { /* dismissal remains active on this page */ }
  };

  const install = async () => {
    if (!allowInstall || standalone || installing || !online) return;
    setInstallationMessage('');
    if (!nightjarInstaller.available()) {
      // Apple Safari and some other browsers do not expose an install API.
      setShowManualSteps(true);
      return;
    }
    setInstalling(true);
    try {
      const result = await nightjarInstaller.prompt();
      if (result === 'accepted') {
        setInstallationMessage('Nightjar installation accepted. Look for the Nightjar icon on your device.');
        dismiss();
      } else if (result === 'dismissed') {
        setInstallationMessage('Installation cancelled. You can try again from Settings → App & Device.');
      } else setShowManualSteps(true);
    } catch {
      setShowManualSteps(true);
      setInstallationMessage('This browser could not open the installer. Use the steps below instead.');
    } finally {
      setNativeReady(nightjarInstaller.available());
      setInstalling(false);
    }
  };

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstalled = () => { setStandalone(true); setNativeReady(false); setInstalling(false); };
    const onReady = () => setNativeReady(nightjarInstaller.available());
    const onUpdate = () => setUpdateReady(true);
    const onShowInstall = () => {
      setDismissedInstall(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // The event is fired from a real click in Settings. Open the native
      // installer immediately when supported, rather than showing instructions.
      if (nightjarInstaller.available()) void install();
      else setShowManualSteps(true);
    };
    const mode = window.matchMedia?.('(display-mode: standalone)');
    const onMode = () => setStandalone(installed());
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('nightjar:install-ready', onReady);
    window.addEventListener('nightjar:update-available', onUpdate);
    window.addEventListener('nightjar:show-install', onShowInstall);
    mode?.addEventListener?.('change', onMode);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('nightjar:install-ready', onReady);
      window.removeEventListener('nightjar:update-available', onUpdate);
      window.removeEventListener('nightjar:show-install', onShowInstall);
      mode?.removeEventListener?.('change', onMode);
    };
  }, [allowInstall, standalone, installing, online]);

  const showInstall = allowInstall && online && !standalone && !dismissedInstall;
  return <>
    {showInstall && <section className="nj-install-invitation" aria-labelledby="nj-install-heading">
      <div className="nj-install-invitation-icon"><Smartphone size={23} aria-hidden="true" /></div>
      <div className="nj-install-invitation-copy">
        <span className="nj-install-invitation-eyebrow">NIGHTJAR ON YOUR DEVICE</span>
        <h2 id="nj-install-heading">Take Nightjar with you.</h2>
        <p>Keep Nightjar on your home screen for a smooth, app-like experience. No extra download fee.</p>
        <div className="nj-install-invitation-actions">
          <button type="button" className="primary-button" disabled={installing} onClick={() => void install()}>
            <Download size={16}/>{installing ? 'Opening installer…' : 'Install Nightjar'}
          </button>
          {!nativeReady && <span className="nj-install-hint">Your browser may need one extra step.</span>}
        </div>
        {installationMessage && <p role="status" className="nj-install-feedback">{installationMessage}</p>}
        {showManualSteps && <div className="nj-install-instructions" id="nj-install-steps">
          <strong>{isIOS() ? 'Add Nightjar to your iPhone or iPad' : 'Install Nightjar from your browser'}</strong>
          {isIOS()
            ? <p>In Safari tap the Share icon, choose <b>Add to Home Screen</b>, then tap <b>Add</b>. If you're inside another app's browser, open this page in Safari first. Apple does not allow websites to launch that installer directly.</p>
            : <p>If no install prompt appeared, open your browser menu (⋮ or ⋯) and choose <b>Install app</b> or <b>Add to Home screen</b>. If that option is missing, open Nightjar in Chrome or another compatible browser.</p>}
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
