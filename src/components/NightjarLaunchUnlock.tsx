import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Fingerprint, KeyRound, ShieldCheck } from 'lucide-react';
import { nightjarAuth } from '../platform/firebase-auth';
import { nightjarPasskeys, NightjarPasskeyError, passkeyDiagnostic, type NightjarPasskeyStep } from '../platform/firebase-passkeys';
import { nightjarQuickUnlock } from '../platform/nightjar-quick-unlock';

const passwordFlowKey = 'nightjar.passkeys.password-fallback.v1';
const lockedSessionKey = 'nightjar.passkeys.locked-workspace.v1';
const rememberLock = (userId: string | null) => { try { if (userId) sessionStorage.setItem(lockedSessionKey,userId); else sessionStorage.removeItem(lockedSessionKey); } catch { /* optional */ } };
/**
 * Refreshing or applying an in-app update must never act like leaving the app.
 * A fresh PWA navigation still requests the saved passkey. Web browsers cannot
 * reliably report a true OS app close; this is deliberately a best effort.
 */
const isPageRefresh = () => {
  const type = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
  let approvedUpdate = false;
  try {
    const marker = Number(sessionStorage.getItem('nightjar.navigation-reload.v1'));
    sessionStorage.removeItem('nightjar.navigation-reload.v1');
    approvedUpdate = marker > 0 && Date.now() - marker < 90_000;
  } catch { /* browser session storage may be disabled */ }
  // If Nightjar already locked itself after being backgrounded, pressing
  // Refresh must never defeat that lock screen.
  let workspaceLocked = false;
  try { workspaceLocked = sessionStorage.getItem(lockedSessionKey) === nightjarQuickUnlock.preference()?.userId; } catch { /* optional */ }
  return !workspaceLocked && (type === 'reload' || approvedUpdate);
};

const isPasswordFlow = () => {
  try {
    return window.location.pathname.startsWith('/account')
      && Number(sessionStorage.getItem(passwordFlowKey)) > Date.now();
  } catch { return false; }
};

const unlockStatus = (step: NightjarPasskeyStep | null) => {
  switch (step) {
    case 'LOGIN_START': return 'Connecting securely to Nightjar…';
    case 'LOGIN_DEVICE': return 'Confirm your saved passkey on your device…';
    case 'LOGIN_VERIFY': return 'Verifying your passkey with Nightjar…';
    case 'LOGIN_SESSION': return 'Opening your secure Nightjar session…';
    default: return 'Preparing secure passkey sign-in…';
  }
};

const unlockError = (error: unknown) => {
  if (error instanceof NightjarPasskeyError) return error.message;
  const name = error instanceof Error ? error.name : '';
  const detail = error instanceof Error ? error.message : String(error ?? '');
  if (name === 'AbortError') return 'Biometric verification was cancelled.';
  if (name === 'NotAllowedError') return 'Verification was cancelled, timed out or blocked. Try again or use your password.';
  if (/different Nightjar account/i.test(detail)) return detail;
  if (/cancelled/i.test(detail)) return 'Verification was cancelled. You can retry or use your password.';
  if (!navigator.onLine) return 'Connect to the internet to verify your passkey, or use password sign-in.';
  return 'Nightjar could not verify that passkey. Retry or sign in using your password.';
};

/**
 * Runs before the React account/room workspaces mount, immediately after the
 * black operating-system PWA splash. A passkey assertion is verified on the
 * server for each fresh unlock. The screen is device-opt-in, not a substitute
 * for Nightjar account, role or age-assurance checks.
 */
export default function NightjarLaunchUnlock({ children }: { children: ReactNode }) {
  const [preference] = useState(() => nightjarQuickUnlock.preference());
  const [refreshNavigation] = useState(isPageRefresh);
  const allowedFlow = isPasswordFlow() ||
    (window.location.pathname.startsWith('/account') && new URLSearchParams(window.location.search).get('entry') === 'register');
  const [redirectGrace] = useState(() => Boolean(
    preference && nightjarQuickUnlock.unlockedRecently(preference.userId),
  ));
  const [locked, setLocked] = useState(() => Boolean(
    preference && !allowedFlow && !redirectGrace && !refreshNavigation,
  ));
  const [authReady, setAuthReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<NightjarPasskeyStep | null>(null);
  const [takingLonger, setTakingLonger] = useState(false);
  const [passwordRedirecting, setPasswordRedirecting] = useState(false);
  const [message, setMessage] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  // No redundant Nightjar sign-in step: show the actual device passkey
  // chooser automatically and reveal the manual unlock screen only if the
  // browser needs user activation or the verification attempt fails.
  const [manualUnlockVisible, setManualUnlockVisible] = useState(!nightjarPasskeys.supported());
  const aborted = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const attemptedAutomatically = useRef(false);
  const hiddenAt = useRef<number | null>(null);
  const supported = nightjarPasskeys.supported();

  // A slow network must never look like a frozen login. This is informational:
  // the native device prompt and server-side verification are never bypassed.
  useEffect(() => {
    if (!busy || !locked) {
      setTakingLonger(false);
      return;
    }
    const timer = window.setTimeout(() => setTakingLonger(true), 5500);
    return () => window.clearTimeout(timer);
  }, [busy, locked]);

  // Refreshing the document reuses Firebase's persisted session. Only a fresh
  // launch/foreground timeout requires the passkey unlock.
  // Consume the one-page redirect allowance immediately. A subsequent app
  // launch will require biometrics even if it occurs seconds after login.
  useEffect(() => {
    if (redirectGrace) nightjarQuickUnlock.lock();
    if (locked && preference) rememberLock(preference.userId);
  }, [redirectGrace]);

  useEffect(() => {
    alive.current = true;
    if (!preference || allowedFlow) {
      setAuthReady(true);
      return () => { alive.current = false; };
    }
    // Do not begin a device prompt until Firebase has hydrated local session.
    // On a fresh launch, revoke the persisted Firebase session before the
    // passkey prompt: this makes the step a real sign-in, not a cosmetic overlay
    // on top of an already authenticated 18+ account.
    let initialIdentityChecked = false;
    const unsubscribe = nightjarAuth.observe(identity => {
      if (!alive.current || initialIdentityChecked) return;
      initialIdentityChecked = true;
      if (identity && identity.userId !== preference.userId) {
        // Another account is signed in on this device. A stale preference for
        // the previous account must not hijack or sign out the current member.
        rememberLock(null);
        setLocked(false);
        setAuthReady(true);
        return;
      }
      // A refresh is not a logout. Firebase already restores this authenticated
      // session; keep it while the biometric overlay protects the workspace.
      // A passkey assertion is still required before revealing the app.
      setAuthReady(true);
    });
    return () => {
      alive.current = false;
      aborted.current?.abort();
      unsubscribe();
    };
  }, [preference?.userId, allowedFlow, redirectGrace]);

  const unlock = async (automatic = false) => {
    if (!preference || busy || !locked) return;
    const controller = new AbortController();
    aborted.current = controller;
    setBusy(true);
    setStep('LOGIN_START');
    setTakingLonger(false);
    setMessage('');
    setDiagnostic('');
    if (automatic) setManualUnlockVisible(false);
    try {
      const identity = await nightjarPasskeys.signIn(preference.userId, controller.signal, (nextStep) => {
        if (alive.current && !controller.signal.aborted) setStep(nextStep);
      });
      if (!alive.current || controller.signal.aborted) return;
      // Only a full-page account-to-workspace redirect needs a one-time pass.
      // Main app unlocks never create a bypass for the next cold launch.
      // A successful server-verified passkey must not be followed by a
      // redundant password screen. Preserve the authenticated Firebase user
      // and grant the one-page redirect allowance only on /account.
      if (window.location.pathname.startsWith('/account')) nightjarQuickUnlock.markUnlocked(identity.userId);
      rememberLock(null);
      setLocked(false);
    } catch (error) {
      if (alive.current && !controller.signal.aborted) {
        setMessage(unlockError(error));
        setDiagnostic(passkeyDiagnostic(error));
        setManualUnlockVisible(true);
      }
    } finally {
      if (alive.current) { setBusy(false); setStep(null); }
      if (aborted.current === controller) aborted.current = null;
    }
  };

  // Many installed PWAs can launch the OS prompt immediately. When a browser
  // requires user activation, the prominent Unlock button remains available.
  useEffect(() => {
    if (!locked || !authReady || !supported || attemptedAutomatically.current) return;
    // StrictMode may cancel the first effect's timer on replay: only mark an
    // automatic attempt when the prompt actually starts.
    const timer = window.setTimeout(() => {
      attemptedAutomatically.current = true;
      void unlock(true);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [locked, authReady, supported]);

  // A resumed PWA may not remount the root. Re-lock after two minutes in the
  // background so the next foreground access again requires user verification.
  useEffect(() => {
    if (!preference || allowedFlow) return;
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      const elapsed = hiddenAt.current === null ? 0 : Date.now() - hiddenAt.current;
      hiddenAt.current = null;
      if (elapsed >= 2 * 60_000 && nightjarQuickUnlock.enabledFor(preference.userId)
        && (!nightjarAuth.current() || nightjarAuth.current()?.userId === preference.userId)) {
        nightjarQuickUnlock.lock();
        rememberLock(preference.userId);
        aborted.current?.abort();
        attemptedAutomatically.current = false;
        setAuthReady(false);
        setLocked(true);
        setMessage('');
        setDiagnostic('');
        setStep(null);
        setTakingLonger(false);
        setManualUnlockVisible(!supported);
        // Protect the existing authenticated session behind the lock screen.
        // Do not sign out on backgrounding or force a second login afterward.
        setAuthReady(true);
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [preference?.userId, allowedFlow]);

  const usePassword = async () => {
    if (!preference || passwordRedirecting) return;
    setPasswordRedirecting(true);
    aborted.current?.abort();
    // The fallback bypass is scoped to the account route and expires quickly.
    // Password sign-in will establish a fresh Firebase session as usual.
    try { sessionStorage.setItem(passwordFlowKey, String(Date.now() + 10 * 60_000)); } catch { /* password route still works */ }
    try { await nightjarAuth.signOut(); }
    catch { /* navigation still provides password account-switch option */ }
    window.location.replace('/account?entry=signin');
  };

  if (!preference || !locked) return <>{children}</>;

  // This is the seamless path after the Android Nightjar splash: the browser's
  // genuine saved-passkey prompt appears over a simple branded background.
  // We must not fake or replace the Android-controlled credential selector.
  if (!manualUnlockVisible && supported) {
    return <main className="nj-launch-unlock nj-launch-unlock-auto" role="main" aria-label="Nightjar secure passkey sign-in">
      <div className="nj-launch-unlock-card nj-launch-unlock-waiting" role="status" aria-live="polite">
        <img src="/brand-logo" className="nj-launch-unlock-logo" alt="Nightjar logo"/>
        <div className="nj-launch-unlock-biometric-emblem" aria-hidden="true"><Fingerprint size={25}/></div>
        <span className="mini-label">NIGHTJAR · SECURE SIGN-IN</span>
        <p>{busy ? unlockStatus(step) : 'Preparing your saved passkey…'}</p>
        <div className="nj-launch-unlock-progress" aria-hidden="true"><span /></div>
        {takingLonger && <small className="nj-launch-unlock-long-wait">Still checking securely. A slower connection can take a little longer.</small>}
        <button type="button" className="ghost-button nj-launch-unlock-fallback"
          disabled={passwordRedirecting} onClick={() => void usePassword()}>
          <KeyRound size={16} aria-hidden="true"/> {passwordRedirecting ? 'Opening email sign-in…' : 'Use email and password'}
        </button>
      </div>
    </main>;
  }

  return <main className="nj-launch-unlock" role="main" aria-labelledby="nj-launch-unlock-title">
    <div className="nj-launch-unlock-card">
      <img src="/brand-logo" className="nj-launch-unlock-logo" alt="Nightjar logo"/>
      <span className="mini-label">NIGHTJAR · PRIVATE ACCESS</span>
      <h1 id="nj-launch-unlock-title">Welcome back.</h1>
      <p aria-live="polite">{busy ? unlockStatus(step) : "Unlock Nightjar with your device's fingerprint, Face ID or passkey."}</p>
      {takingLonger && <small className="nj-launch-unlock-long-wait">Still checking securely. Your device or connection may be taking longer than usual.</small>}
      <button type="button" className="primary-button nj-launch-unlock-action"
        onClick={() => void unlock()} disabled={!authReady || busy || !supported}>
        <Fingerprint size={20} aria-hidden="true"/>
        {busy ? 'Verifying securely…' : !supported ? 'Biometrics unavailable on this device' : 'Unlock with biometrics'}
      </button>
      <button type="button" className="ghost-button nj-launch-unlock-fallback"
        disabled={passwordRedirecting} onClick={() => void usePassword()}>
        <KeyRound size={16} aria-hidden="true"/> {passwordRedirecting ? 'Opening email sign-in…' : 'Use email and password'}
      </button>
      {message && <div className="nj-launch-unlock-message" role="status" aria-live="polite">
        <p>{message}</p>
        {diagnostic && diagnostic !== 'UNKNOWN' && <small className="nj-launch-unlock-diagnostic">Diagnostic: {diagnostic}</small>}
      </div>}
      <div className="nj-launch-unlock-privacy"><ShieldCheck size={15} aria-hidden="true"/>
        <small>Your biometrics stay on your device. Nightjar verifies the passkey, then checks your existing account and age-assurance access.</small>
      </div>
    </div>
  </main>;
}

/** A password login is just as valid as a biometric unlock for route redirects. */
export const markPasswordAuthenticated = (uid: string) => {
  nightjarQuickUnlock.markUnlocked(uid);
  rememberLock(null);
  try { sessionStorage.removeItem(passwordFlowKey); } catch { /* optional */ }
};
