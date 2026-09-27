import { useState } from 'react';
import { Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { nightjarAuth, type NightjarIdentity } from '../platform/firebase-auth';

type Mode = 'signin' | 'register' | 'reset' | 'verify' | 'security';

const friendlyError = (error: unknown) => {
  const value = error instanceof Error ? error.message : String(error ?? '');
  if (value.includes('email-already-in-use')) return 'That email already has a Nightjar account.';
  if (value.includes('invalid-credential')) return 'The email or password is incorrect.';
  if (value.includes('weak-password')) return 'Use a stronger password of at least 12 characters.';
  if (value.includes('too-many-requests')) return 'Too many attempts. Please wait before trying again.';
  if (value.includes('invalid-email')) return 'Enter a valid email address.';
  if (value.includes('requires-recent-login')) return 'For security, sign in again before changing your password.';
  if (value.includes('operation-not-allowed')) return 'Email/password accounts are not enabled in Firebase Authentication yet. Enable the Email/Password provider, then try again.';
  if (value.includes('network-request-failed')) return 'Nightjar could not reach Firebase. Check your connection and try again.';
  if (value.includes('user-disabled')) return 'This Nightjar account has been disabled. Contact an administrator for review.';
  return 'Nightjar could not complete that account request. Please try again.';
};

const validPassword = (value: string) =>
  value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);

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
      setMessage('Use 12+ characters with upper-case, lower-case and a number.');
      return;
    }
    if (mode === 'register' && password !== confirm) {
      setMessage('Your password confirmation does not match.');
      return;
    }

    void run(async () => {
      if (mode === 'register') {
        const next = await nightjarAuth.register(email, password);
        onAuthenticated(next);
        setMode('verify');
        setMessage('Account created. We sent a verification link to your email.');
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
      {mode === 'register' && <div className="account-access-field"><label>Confirm password</label><input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /><small>12+ characters · upper-case · lower-case · number</small></div>}
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
