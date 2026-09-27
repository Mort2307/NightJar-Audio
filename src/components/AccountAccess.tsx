import { useState } from 'react';
import { Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { nightjarAuth, type NightjarIdentity } from '../platform/firebase-auth';

type Mode = 'signin' | 'register' | 'reset' | 'verify' | 'security';

const firebaseErrorCode = (error: unknown) => {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return String((error as { code: string }).code);
  }
  const value = error instanceof Error ? error.message : String(error ?? '');
  const match = value.match(/auth\/[a-z0-9-]+/i);
  return match?.[0] ?? '';
};

const friendlyError = (error: unknown) => {
  const code = firebaseErrorCode(error);
  const value = error instanceof Error ? error.message : String(error ?? '');
  const detail = code || value;

  if (detail.includes('email-already-in-use')) return 'That email already has a Nightjar account. Try signing in instead.';
  if (detail.includes('invalid-credential')) return 'The email or password is incorrect.';
  if (detail.includes('weak-password') || detail.includes('password-does-not-meet-requirements')) return 'Firebase rejected that password under the project password policy. Try a longer password with upper-case, lower-case, a number and a symbol.';
  if (detail.includes('too-many-requests')) return 'Too many attempts. Please wait before trying again.';
  if (detail.includes('invalid-email')) return 'Enter a valid email address.';
  if (detail.includes('requires-recent-login')) return 'For security, sign in again before changing your password.';
  if (detail.includes('operation-not-allowed') || detail.includes('configuration-not-found')) return 'Email/password registration is not enabled correctly in Firebase Authentication for this project.';
  if (detail.includes('admin-restricted-operation')) return 'Firebase is currently configured to block end-user account creation. Enable user sign-up in Authentication settings.';
  if (detail.includes('network-request-failed')) return 'Nightjar could not reach Firebase. Check your connection and try again.';
  if (detail.includes('user-disabled')) return 'This Nightjar account has been disabled. Contact an administrator for review.';
  if (detail.includes('app-not-authorized') || detail.includes('unauthorized-domain')) return 'This Nightjar domain is not authorised for Firebase Authentication yet.';
  if (detail.includes('invalid-api-key')) return 'Nightjar is using an invalid Firebase web API key. Check the Firebase web app configuration.';
  return `Nightjar account request failed (${code || 'unknown Firebase error'}). Please try again.`;
};

const passwordChecks = (value: string) => ({
  length: value.length >= 12,
  lower: /\p{Ll}/u.test(value),
  upper: /\p{Lu}/u.test(value),
  number: /\p{N}/u.test(value),
  symbol: /[^\p{L}\p{N}\s]/u.test(value),
});

const validPassword = (value: string) => {
  const checks = passwordChecks(value);
  return checks.length && checks.lower && checks.upper && checks.number;
};

export default function AccountAccess({
  identity,
  onAuthenticated,
  onSignedOut,
}: {
  identity: NightjarIdentity | null;
  onAuthenticated: (identity: NightjarIdentity) => void;
  onSignedOut?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(identity ? (identity.emailVerified ? 'security' : 'verify') : 'signin');
  const [email, setEmail] = useState(identity?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [nextConfirm, setNextConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');


  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try { await operation(); }
    catch (error) { setMessage(friendlyError(error)); }
    finally { setBusy(false); }
  };

  const submit = () => {
    if (!email.trim()) {
      setMessage('Enter the email address you want to use for Nightjar.');
      return;
    }
    if (mode !== 'reset' && !password) {
      setMessage('Enter your password.');
      return;
    }
    if (mode === 'register' && !validPassword(password)) {
      const checks = passwordChecks(password);
      const missing = [
        !checks.length ? '12+ characters' : null,
        !checks.lower ? 'a lower-case letter' : null,
        !checks.upper ? 'an upper-case letter' : null,
        !checks.number ? 'a number' : null,
      ].filter(Boolean);
      setMessage('Password still needs: ' + missing.join(', ') + '.');
      return;
    }
    if (mode === 'register' && password !== confirm) {
      setMessage('Your password confirmation does not match.');
      return;
    }

    void run(async () => {
      if (mode === 'register') {
        const result = await nightjarAuth.register(email, password);
        onAuthenticated(result.identity);
        setMode('verify');
        setMessage(result.verificationSent
          ? 'Account created. We sent a verification link to your email.'
          : 'Account created, but the verification email could not be sent. Use Resend email below.');
        return;
      }
      if (mode === 'signin') {
        const next = await nightjarAuth.signIn(email, password);
        onAuthenticated(next);
        setMode(next.emailVerified ? 'security' : 'verify');
        return;
      }
      if (mode === 'reset') {
        await nightjarAuth.resetPassword(email);
        setMessage('If that address belongs to a Nightjar account, a password reset email has been sent.');
      }
    });
  };

  if (mode === 'verify' && identity) {
    return <section className="account-access-card">
      <div className="account-access-mark"><Mail size={22} /></div>
      <span className="mini-label">ACCOUNT SECURITY</span>
      <h2>Verify your email</h2>
      <p>Nightjar needs a verified email before age assurance, subscriptions or protected content can be attached to this account.</p>
      <strong>{identity.email}</strong>
      {message && <p className="account-access-message">{message}</p>}
      <div className="account-access-actions">
        <button className="primary-button" disabled={busy} onClick={() => void run(async () => {
          const next = await nightjarAuth.reloadIdentity();
          if (next?.emailVerified) { onAuthenticated(next); setMode('security'); setMessage('Email verified.'); }
          else setMessage('We have not received verification yet. Open the link in your email, then check again.');
        })}>I've verified my email</button>
        <button className="secondary-button" disabled={busy} onClick={() => void run(async () => {
          await nightjarAuth.resendVerification();
          setMessage('A new verification email has been sent.');
        })}>Resend email</button>
      </div>
    </section>;
  }

  if (mode === 'security' && identity) {
    return <section className="account-access-card">
      <div className="account-access-mark"><ShieldCheck size={22} /></div>
      <span className="mini-label">ACCOUNT SECURITY</span>
      <h2>Your Nightjar account</h2>
      <p>{identity.email} · {identity.emailVerified ? 'Email verified' : 'Verification required'}</p>
      <div className="account-access-field"><label>Current password</label><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div>
      <div className="account-access-field"><label>New password</label><input type="password" autoComplete="new-password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} /></div>
      <div className="account-access-field"><label>Confirm new password</label><input type="password" autoComplete="new-password" value={nextConfirm} onChange={(event) => setNextConfirm(event.target.value)} /></div>
      {message && <p className="account-access-message">{message}</p>}
      <div className="account-access-actions">
        <button className="primary-button" disabled={busy || !validPassword(nextPassword) || nextPassword !== nextConfirm} onClick={() => void run(async () => {
          await nightjarAuth.changePassword(currentPassword, nextPassword);
          setCurrentPassword(''); setNextPassword(''); setNextConfirm('');
          setMessage('Password changed. Your Nightjar account is secured with the new password.');
        })}><KeyRound size={15} /> Change password</button>
        <button className="ghost-button" disabled={busy} onClick={() => void run(async () => { await nightjarAuth.signOut(); onSignedOut?.(); setMode('signin'); })}>Sign out</button>
      </div>
    </section>;
  }

  return <section className="account-access-card">
    <div className="account-access-mark"><LockKeyhole size={22} /></div>
    <span className="mini-label">NIGHTJAR ACCOUNT</span>
    <h2>{mode === 'register' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Enter Nightjar'}</h2>
    <p>{mode === 'register' ? 'Your login identity stays private from your public Nightjar profile.' : mode === 'reset' ? 'We will send a secure reset link to your account email.' : 'Sign in with your protected Nightjar account.'}</p>
    <div className="account-access-field"><label>Email</label><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
    {mode !== 'reset' && <>
      <div className="account-access-field"><label>Password</label><div className="account-password-input"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
      {mode === 'register' && <>
        <div className="account-password-requirements" aria-live="polite">
          {(() => {
            const checks = passwordChecks(password);
            return <>
              <small>{checks.length ? '✓' : '○'} 12+ characters ({password.length})</small>
              <small>{checks.lower ? '✓' : '○'} lower-case</small>
              <small>{checks.upper ? '✓' : '○'} upper-case</small>
              <small>{checks.number ? '✓' : '○'} number</small>
              <small>{checks.symbol ? '✓' : '○'} symbol</small>
            </>;
          })()}
        </div>
        <div className="account-access-field"><label>Confirm password</label><input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /><small>{confirm ? (password === confirm ? '✓ Passwords match' : 'Passwords do not match yet') : 'Re-enter your password'}</small></div>
      </>}
    </>}
    {message && <p className="account-access-message" role="status" aria-live="polite">{message}</p>}
    <button type="button" className="primary-button account-access-submit" disabled={busy} onClick={submit}>{busy ? 'Working…' : mode === 'register' ? 'Create protected account' : mode === 'reset' ? 'Send reset email' : 'Sign in'}</button>
    <div className="account-access-switches">
      {mode !== 'signin' && <button onClick={() => { setMode('signin'); setMessage(''); }}>Already have an account?</button>}
      {mode !== 'register' && <button onClick={() => { setMode('register'); setMessage(''); }}>Create account</button>}
      {mode !== 'reset' && <button onClick={() => { setMode('reset'); setMessage(''); }}>Forgot password?</button>}
    </div>
  </section>;
}
