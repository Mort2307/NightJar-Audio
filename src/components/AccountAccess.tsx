import { useEffect, useState } from 'react';
import { AudioLines, Brush, Eye, EyeOff, FileText, Headphones, KeyRound, LockKeyhole, Mail, Mic2, ShieldCheck } from 'lucide-react';
import { nightjarAuth, type NightjarIdentity } from '../platform/firebase-auth';
import { nightjarAccount } from '../platform/firebase-account';
import { nightjarAuthSecurity } from '../platform/firebase-auth-security';

type Mode = 'signin' | 'register' | 'reset' | 'verify' | 'security';
type RegistrationRole = 'listener' | 'creator' | 'writer' | 'editor' | 'artist';

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
  if (detail.includes('operation-not-allowed')) return 'Firebase is returning auth/operation-not-allowed: Email/Password is disabled for the Firebase project NightJar is actually connected to.';
  if (detail.includes('configuration-not-found')) return 'Firebase is returning auth/configuration-not-found: the Authentication configuration for the Firebase project NightJar is connected to cannot be found.';
  if (detail.includes('admin-restricted-operation')) return 'Firebase is currently configured to block end-user account creation. Enable user sign-up in Authentication settings.';
  if (detail.includes('network-request-failed')) return 'Nightjar could not reach Firebase. Check your connection and try again.';
  if (detail.includes('user-disabled')) return 'This Nightjar account has been disabled. Contact an administrator for review.';
  if (detail.includes('app-not-authorized') || detail.includes('unauthorized-domain')) return 'This Nightjar domain is not authorised for Firebase Authentication yet.';
  if (detail.includes('invalid-api-key')) return 'Nightjar is using an invalid Firebase web API key. Check the Firebase web app configuration.';
  if (detail.includes('permission-denied') || value.toLowerCase().includes('private testing')) return 'Nightjar is currently in private testing. This email has not been invited by an administrator.';
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
  const entryParams = new URLSearchParams(window.location.search);
  const requestedEntry = entryParams.get('entry');
  const requestedRole = entryParams.get('role');
  const initialRegistrationRoles = (() => {
    if (['creator','writer','editor','artist'].includes(String(requestedRole))) return [requestedRole as RegistrationRole];
    try {
      const stored = JSON.parse(sessionStorage.getItem('nightjar.registrationRoles') ?? '[]');
      if (Array.isArray(stored)) return stored.filter((role): role is RegistrationRole => ['creator','writer','editor','artist'].includes(String(role)));
    } catch { /* legacy registration state falls through */ }
    const legacy = sessionStorage.getItem('nightjar.registrationRole');
    return ['creator','writer','editor','artist'].includes(String(legacy)) ? [legacy as RegistrationRole] : [];
  })();
  const [mode, setMode] = useState<Mode>(identity && !identity.emailVerified ? 'verify' : requestedEntry === 'register' ? 'register' : 'signin');
  const [registrationRoles, setRegistrationRoles] = useState<RegistrationRole[]>(initialRegistrationRoles);
  const [email, setEmail] = useState(identity?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [nextConfirm, setNextConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const guestEntryMode: Mode = requestedEntry === 'register' ? 'register' : 'signin';
    const normalEntryMode: Mode = identity && !identity.emailVerified ? 'verify' : identity ? 'signin' : guestEntryMode;
    setMode(normalEntryMode);
    setMessage('');

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setMode(identity && !identity.emailVerified ? 'verify' : identity ? 'signin' : guestEntryMode);
      setMessage('');
      setPassword('');
      setConfirm('');
    };

    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [identity?.userId, identity?.emailVerified, requestedEntry]);


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
        const access = await nightjarAccount.registrationAccess(email);
        if (access.closedBeta && !access.allowed) {
          setMessage('Nightjar is currently in private testing. This email has not been invited by an administrator.');
          return;
        }
        sessionStorage.setItem('nightjar.registrationRoles', JSON.stringify(registrationRoles));
        sessionStorage.removeItem('nightjar.registrationRole');
        const referralCode = entryParams.get('ref');
        if (referralCode && registrationRoles.includes('creator')) sessionStorage.setItem('nightjar.creatorReferralCode', referralCode);
        const result = await nightjarAuth.register(email, password);
        await nightjarAccount.stageRegistration(['listener', ...registrationRoles], registrationRoles.includes('creator') ? referralCode ?? '' : '');
        onAuthenticated(result.identity);
        setMode('verify');
        setMessage(result.verificationSent
          ? 'Account created. We sent a verification link to your email. If you cannot see it, check your spam or junk folder.'
          : 'Account created, but the verification email could not be sent. Use Resend email below. If a later email does not appear, also check your spam or junk folder.');
        return;
      }
      if (mode === 'signin') {
        const access = await nightjarAccount.registrationAccess(email);
        if (access.closedBeta && !access.allowed) {
          void nightjarAuthSecurity.recordFailure({
            email,
            eventType:'closed_beta_signin_denied',
            firebaseCode:'closed_beta_not_invited',
          }).catch(() => { /* security telemetry must never block account UX */ });
          setMessage('Nightjar is currently in private testing. This email has not been invited by an administrator.');
          return;
        }
        let next;
        try {
          next = await nightjarAuth.signIn(email, password);
        } catch (error) {
          const code = firebaseErrorCode(error) || 'auth/unknown';
          if (['auth/invalid-credential','auth/too-many-requests','auth/user-disabled','auth/invalid-email'].includes(code)) {
            void nightjarAuthSecurity.recordFailure({
              email,
              eventType:'signin_failed',
              firebaseCode:code,
            }).catch(() => { /* security telemetry must never block account UX */ });
          }
          throw error;
        }
        onAuthenticated(next);
        setMode(next.emailVerified ? 'signin' : 'verify');
        if (next.emailVerified) setMessage('Signed in. Opening Nightjar…');
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
      <p>Nightjar needs a verified email before subscriptions, professional permissions or protected content can be attached to this account. We have sent a verification link to your email; if it is not in your inbox, check your spam or junk folder.</p>
      <strong>{identity.email}</strong>
      {message && <p className="account-access-message">{message}</p>}
      <div className="account-access-actions">
        <button className="primary-button" disabled={busy} onClick={() => void run(async () => {
          const next = await nightjarAuth.reloadIdentity();
          if (next?.emailVerified) { onAuthenticated(next); setMode('signin'); setMessage('Email verified. Opening Nightjar…'); }
          else setMessage('We have not received verification yet. Open the link in your email, then check again.');
        })}>I've verified my email</button>
        <button className="secondary-button" disabled={busy} onClick={() => void run(async () => {
          await nightjarAuth.resendVerification();
          setMessage('A new verification email has been sent. If it does not appear in your inbox, check your spam or junk folder.');
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
    <h2>{mode === 'register' ? 'Choose your Nightjar roles.' : mode === 'reset' ? 'Reset your password' : 'Enter Nightjar'}</h2>
    <p>{mode === 'register' ? 'Listener access is included with every account. Select any professional roles you want to apply for now — one account can combine VA Creator, Writer, Audio Editor and Artist access after approval.' : mode === 'reset' ? 'We will send a secure reset link to your account email.' : 'Sign in with your protected Nightjar account.'}</p>
    {mode === 'register' && <div className="demo-warning"><ShieldCheck size={17}/><div><strong>PRIVATE TESTING</strong><span>Account creation is restricted to email addresses approved by a Nightjar administrator. Approved testers still verify their email normally before access is granted.</span></div></div>}
    {mode === 'signin' && <div className="account-workspace-overview" aria-label="Nightjar account workspaces">
      <span><Headphones size={14}/><strong>Listener</strong><small>Discovery, subscription, comments, Like/Love and private library.</small></span>
      <span><Mic2 size={14}/><strong>Creator</strong><small>Publishing, credits, professional messaging and Creator Studio.</small></span>
      <span><FileText size={14}/><strong>Writer</strong><small>Protected scripts, rights, collaboration and Writer Studio.</small></span>
      <span><AudioLines size={14}/><strong>Audio Editor</strong><small>Assigned work, production credits, messaging and Editorial.</small></span>
      <span><Brush size={14}/><strong>Artist</strong><small>Portfolio, commissions, visual collaboration and artwork credits.</small></span>
      <em>Your account can hold multiple approved professional roles. Switch workspaces from your profile whenever you need to.</em>
    </div>}
    {mode === 'register' && <div className="account-role-cards" aria-label="Choose Nightjar professional roles">
      <div className="account-role-card selected account-role-card-included" aria-label="Listener access included">
        <span><Headphones size={19}/></span><div><strong>Listener · included</strong><small>Subscribe, listen, comment, follow profiles and build your private library. This access does not need professional approval.</small></div>
      </div>
      {[
        { role:'creator' as const, title:'VA Creator', detail:'Apply to publish audio, manage releases and collaborate with Writers, Audio Editors and Artists.', icon:<Mic2 size={19}/> },
        { role:'writer' as const, title:'Writer', detail:'Apply for protected scripts, rights, commissions and creative collaboration.', icon:<FileText size={19}/> },
        { role:'editor' as const, title:'Audio Editor', detail:'Apply for editing, production credits and professional collaboration.', icon:<AudioLines size={19}/> },
        { role:'artist' as const, title:'Artist', detail:'Apply to show a real-art portfolio, take commissions and create cover, character and promotional artwork.', icon:<Brush size={19}/> },
      ].map((item)=>{
        const selected = registrationRoles.includes(item.role);
        return <button type="button" key={item.role} className={selected?'account-role-card selected':'account-role-card'} aria-pressed={selected} onClick={()=>{
          setRegistrationRoles((current)=>{
            const next = current.includes(item.role) ? current.filter((role)=>role!==item.role) : [...current,item.role];
            sessionStorage.setItem('nightjar.registrationRoles', JSON.stringify(next));
            return next;
          });
        }}>
          <span>{item.icon}</span><div><strong>{item.title}</strong><small>{item.detail} Applications are banked until Nightjar opens a controlled intake wave.</small></div>
        </button>;
      })}
      <p className="account-role-choice-note"><ShieldCheck size={13}/> {registrationRoles.length
        ? <>You are applying for <strong>{registrationRoles.map((role)=>role === 'creator' ? 'VA Creator' : role === 'editor' ? 'Audio Editor' : role === 'artist' ? 'Artist' : 'Writer').join(' + ')}</strong>. These roles stay banked until Mike or Megs approves them for an intake wave.</>
        : <>You are creating a <strong>Listener</strong> account only. You can apply for professional roles later from your profile.</>}</p>
    </div>}
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
    <button type="button" className="primary-button account-access-submit" disabled={busy} onClick={submit}>{busy ? 'Working…' : mode === 'register' ? 'Create approved tester account' : mode === 'reset' ? 'Send reset email' : 'Sign in'}</button>
    <div className="account-access-switches">
      {mode !== 'signin' && <button onClick={() => { setMode('signin'); setMessage(''); }}>Already have an account?</button>}
      {mode !== 'register' && <button onClick={() => { setMode('register'); setMessage(''); }}>Create account</button>}
      {mode !== 'reset' && <button onClick={() => { setMode('reset'); setMessage(''); }}>Forgot password?</button>}
    </div>
  </section>;
}
