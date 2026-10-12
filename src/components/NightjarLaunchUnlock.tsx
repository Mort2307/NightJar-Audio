import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Fingerprint, KeyRound, ShieldCheck } from 'lucide-react';
import { nightjarAuth } from '../platform/firebase-auth';
import { nightjarPasskeys, NightjarPasskeyError, passkeyDiagnostic } from '../platform/firebase-passkeys';
import { nightjarQuickUnlock } from '../platform/nightjar-quick-unlock';

const passwordFlowKey = 'nightjar.passkeys.password-fallback.v1';
const isPasswordFlow = () => {
  try {
    return window.location.pathname.startsWith('/account')
      && Number(sessionStorage.getItem(passwordFlowKey)) > Date.now();
  } catch { return false; }
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
  const allowedFlow = isPasswordFlow() ||
    (window.location.pathname.startsWith('/account') && new URLSearchParams(window.location.search).get('entry') === 'register');
  const [redirectGrace] = useState(() => Boolean(
    preference && nightjarQuickUnlock.unlockedRecently(preference.userId),
  ));
  const [sessionGrace] = useState(() => Boolean(
    preference && nightjarQuickUnlock.canRestoreSession(preference.userId),
  ));
  const canResume = redirectGrace || sessionGrace;
  const [locked, setLocked] = useState(() => Boolean(
    preference && !allowedFlow && !canResume,
  ));
  const [authReady, setAuthReady] = useState(false);
  const [busy, setBusy] = useState(false);
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

  // Consume one-page redirect grace without destroying the verified tab's
  // refresh continuity. A cold launch after the idle lock still asks for WebAuthn.
  useEffect(() => {
    if (redirectGrace) nightjarQuickUnlock.consumeRedirect();
  }, [redirectGrace]);

  useEffect(() => {
    alive.current = true;
    if (!preference || allowedFlow) {
      setAuthReady(true);
      return () => { alive.current = false; };
    }
    // Firebase must hydrate before any continuity can be trusted. A stored
    // tab marker never grants access without matching current Firebase auth.
    // A genuinely fresh locked launch still revokes persistence for WebAuthn.
    let initialIdentityChecked = false;
    const unsubscribe = nightjarAuth.observe(identity => {
      if (!alive.current || initialIdentityChecked) return;
      initialIdentityChecked = true;
      if (identity && identity.userId !== preference.userId) {
        // Another account is signed in on this device. A stale preference for
        // the previous account must not hijack or sign out the current member.
        setLocked(false);
        setAuthReady(true);
        return;
      }
      if (identity && canResume) {
        nightjarQuickUnlock.markForeground(identity.userId);
        setLocked(false);
        setAuthReady(true);
        return;
      }
      if (identity) {
        void nightjarAuth.signOut().catch(() => { /* locked screen still protects entry */ })
          .finally(() => { if (alive.current) setAuthReady(true); });
        return;
      }
      // The tab marker cannot resurrect an expired or signed-out Firebase
      // session. Offer a genuine passkey sign-in rather than rendering the app.
      if (canResume) setLocked(true);
      setAuthReady(true);
    });
    return () => {
      alive.current = false;
      aborted.current?.abort();
      unsubscribe();
    };
  }, [preference?.userId, allowedFlow, canResume]);

  const unlock = async (automatic = false) => {
    if (!preference || busy || !locked) return;
    const controller = new AbortController();
    aborted.current = controller;
    setBusy(true);
    setMessage('');
    setDiagnostic('');
    if (automatic) setManualUnlockVisible(false);
    try {
      const identity = await nightjarPasskeys.signIn(preference.userId, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      // A successful server-verified passkey authorises this browser tab to
      // survive refresh. Firebase identity/role/18+ checks still run normally.
      nightjarQuickUnlock.markUnlocked(identity.userId);
      setLocked(false);
    } catch (error) {
      if (alive.current && !controller.signal.aborted) {
        setMessage(unlockError(error));
        setDiagnostic(passkeyDiagnostic(error));
        setManualUnlockVisible(true);
      }
    } finally {
      if (alive.current) setBusy(false);
      if (aborted.current === controller) aborted.current = null;
    }
  };

  // Many installed PWAs can launch the OS prompt immediately. When a browser
  // requires user activation, the prominent Unlock button remains available.
  useEffect(() => {
    if (!locked || !authReady || !supported || attemptedAutomatically.current) return;
    // Set the flag inside the timer: React StrictMode can cancel the first
    // effect's timer during its dev-only setup/cleanup replay.
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
        nightjarQuickUnlock.markBackground(preference.userId);
        return;
      }
      const elapsed = hiddenAt.current === null ? 0 : Date.now() - hiddenAt.current;
      hiddenAt.current = null;
      if (elapsed < 2 * 60_000 && nightjarQuickUnlock.canRestoreSession(preference.userId)) {
        nightjarQuickUnlock.markForeground(preference.userId);
      }
      if (elapsed >= 2 * 60_000 && nightjarQuickUnlock.enabledFor(preference.userId)
        && (!nightjarAuth.current() || nightjarAuth.current()?.userId === preference.userId)) {
        nightjarQuickUnlock.lock();
        aborted.current?.abort();
        attemptedAutomatically.current = false;
        setAuthReady(false);
        setLocked(true);
        setMessage('');
        setDiagnostic('');
        setManualUnlockVisible(!supported);
        // Relock is also a real session boundary when returning to Nightjar.
        void nightjarAuth.signOut().catch(() => { /* user can still use password */ })
          .finally(() => { if (alive.current) setAuthReady(true); });
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [preference?.userId, allowedFlow]);

  const usePassword = async () => {
    if (!preference) return;
    aborted.current?.abort();
    // The fallback bypass is scoped to the account route and expires quickly.
    // Password sign-in will establish a fresh Firebase session as usual.
    try { sessionStorage.setItem(passwordFlowKey, String(Date.now() + 10 * 60_000)); } catch { /* password route still works */ }
    try { await nightjarAuth.signOut(); }
    catch { /* navigation still provides password account-switch option */ }
    window.location.replace('/account?entry=signin');
  };

  if (!preference) return <>{children}</>;
  // Never flash the sign-in or adult catalogue while Firebase validates a
  // remembered identity on refresh. Only mount workspaces after hydration.
  if (canResume && !authReady) return <main className="nj-launch-unlock nj-launch-unlock-auto" role="status" aria-live="polite">
    <div className="nj-launch-unlock-card nj-launch-unlock-waiting">
      <img src="/brand-logo" className="nj-launch-unlock-logo" alt="Nightjar logo"/>
      <p>Restoring your secure Nightjar session…</p>
    </div>
  </main>;
  if (!locked) return <>{children}</>;

  // This is the seamless path after the Android Nightjar splash: the browser's
  // genuine saved-passkey prompt appears over a simple branded background.
  // We must not fake or replace the Android-controlled credential selector.
  if (!manualUnlockVisible && supported) {
    return <main className="nj-launch-unlock nj-launch-unlock-auto" role="main" aria-label="Nightjar secure passkey sign-in">
      <div className="nj-launch-unlock-card nj-launch-unlock-waiting" role="status" aria-live="polite">
        <img src="/brand-logo" className="nj-launch-unlock-logo" alt="Nightjar logo"/>
        <span className="mini-label">NIGHTJAR · SECURE SIGN-IN</span>
        <p>{busy ? 'Confirm your saved passkey on your device…' : 'Opening your saved passkey…'}</p>
        <button type="button" className="ghost-button nj-launch-unlock-fallback"
          onClick={() => void usePassword()}>
          <KeyRound size={16} aria-hidden="true"/> Use email and password
        </button>
      </div>
    </main>;
  }

  return <main className="nj-launch-unlock" role="main" aria-labelledby="nj-launch-unlock-title">
    <div className="nj-launch-unlock-card">
      <img src="/brand-logo" className="nj-launch-unlock-logo" alt="Nightjar logo"/>
      <span className="mini-label">NIGHTJAR · PRIVATE ACCESS</span>
      <h1 id="nj-launch-unlock-title">Welcome back.</h1>
      <p>Unlock Nightjar with your device's fingerprint, Face ID or passkey.</p>
      <button type="button" className="primary-button nj-launch-unlock-action"
        onClick={() => void unlock()} disabled={!authReady || busy || !supported}>
        <Fingerprint size={20} aria-hidden="true"/>
        {busy ? 'Waiting for your device…' : !supported ? 'Biometrics unavailable on this device' : 'Unlock with biometrics'}
      </button>
      <button type="button" className="ghost-button nj-launch-unlock-fallback" onClick={() => void usePassword()}>
        <KeyRound size={16} aria-hidden="true"/> Use email and password
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
  try { sessionStorage.removeItem(passwordFlowKey); } catch { /* optional */ }
};
