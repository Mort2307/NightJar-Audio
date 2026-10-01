import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import AccountAccess from './AccountAccess';
import { nightjarAuth, type NightjarIdentity } from '../platform/firebase-auth';
import { nightjarAccount, type NightjarAccountIdentity } from '../platform/firebase-account';
import { nightjarMedia } from '../platform/firebase-media';

const accountDestination = (account: NightjarAccountIdentity) => {
  if (account.admin || account.role === 'admin') return '/admin';
  if (account.role === 'creator') return '/creator';
  if (account.role === 'writer') return '/writer';
  if (account.role === 'editor') return '/editor';
  if (account.role === 'listener') return '/discover';
  return null;
};

export default function AccountPortal() {
  const [identity, setIdentity] = useState<NightjarIdentity | null>(() => nightjarAuth.current());
  const [account, setAccount] = useState<NightjarAccountIdentity | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [message, setMessage] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const loadAccount = async (nextIdentity: NightjarIdentity | null, enterApp = false) => {
    if (!nextIdentity?.emailVerified) {
      setAccount(null);
      return;
    }
    setLoadingAccount(true);
    setMessage('');
    try {
      let nextAccount = await nightjarAccount.identity();
      const pendingRole = sessionStorage.getItem('nightjar.registrationRole') as 'listener' | 'creator' | 'writer' | 'editor' | null;
      const referralCode = sessionStorage.getItem('nightjar.creatorReferralCode') ?? '';
      if (!nextAccount.admin && !nextAccount.role && pendingRole && ['listener','creator','writer','editor'].includes(pendingRole)) {
        await nightjarAccount.chooseRole(pendingRole, referralCode);
        nextAccount = await nightjarAccount.identity();
        sessionStorage.removeItem('nightjar.registrationRole');
        sessionStorage.removeItem('nightjar.creatorReferralCode');
      }
      setAccount(nextAccount);

      if (nextAccount.status === 'suspended') {
        setMessage('This Nightjar account is suspended. Contact Nightjar support if you believe this needs review.');
        return;
      }

      if (enterApp) {
        const destination = accountDestination(nextAccount);
        if (destination) {
          window.location.replace(destination);
          return;
        }
      }
    } catch {
      setAccount(null);
      setMessage('Nightjar could not reach the protected account service. Try again in a moment.');
    } finally {
      setLoadingAccount(false);
    }
  };

  useEffect(() => {
    const entry = new URLSearchParams(window.location.search).get('entry');
    if (entry === 'signin') {
      window.history.replaceState({}, '', '/account');
    }

    const refreshBranding = () => {
      void nightjarMedia.getBranding().then((data) => {
        const nextLogo = data.logoUrl ?? null;
        setLogoUrl(nextLogo);
        const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
        const touchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
        if (favicon) favicon.href = nextLogo ?? '/favicon.svg';
        if (touchIcon) touchIcon.href = nextLogo ?? '/favicon.svg';
      }).catch(() => { /* static fallback remains available */ });
    };

    refreshBranding();
    const unsubscribe = nightjarAuth.observe((next) => {
      setIdentity(next);
      void loadAccount(next, Boolean(next?.emailVerified));
    });
    const onFocus = () => refreshBranding();
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'nightjar.branding.version') refreshBranding();
    };
    const onBrandingChanged = () => refreshBranding();
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    window.addEventListener('nightjar:branding-changed', onBrandingChanged);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('nightjar:branding-changed', onBrandingChanged);
    };
  }, []);

  const chooseRole = async (role: 'listener' | 'creator' | 'writer' | 'editor') => {
    setLoadingAccount(true);
    setMessage('');
    try {
      await nightjarAccount.chooseRole(role, sessionStorage.getItem('nightjar.creatorReferralCode') ?? '');
      const nextAccount = await nightjarAccount.identity();
      setAccount(nextAccount);
      const destination = accountDestination(nextAccount);
      if (destination) window.location.replace(destination);
    } catch {
      setMessage('Nightjar could not save that account role.');
    } finally {
      setLoadingAccount(false);
    }
  };

  return <main className="account-portal-shell">
    <header className="account-portal-header">
      <a href="/discover" className="account-portal-brand"><img className="account-portal-logo" src={logoUrl ?? "/favicon.svg"} alt="" /> Nightjar</a>
      <span>Secure account access</span>
    </header>

    {!identity?.emailVerified && <AccountAccess
      key={(identity?.userId ?? 'guest') + ':' + String(identity?.emailVerified ?? false)}
      identity={identity}
      onAuthenticated={(next) => {
        setIdentity(next);
        void loadAccount(next, true);
      }}
      onSignedOut={() => {
        setIdentity(null);
        setAccount(null);
      }}
    />}

    {identity?.emailVerified && <section className="account-backend-card">
      <div className="account-backend-heading">
        <ShieldCheck size={19} />
        <div>
          <strong>Verified Nightjar identity</strong>
          <span>Firebase Authentication → trusted Nightjar backend</span>
        </div>
        <button className="ghost-button" onClick={() => void nightjarAuth.signOut().then(() => { setIdentity(null); setAccount(null); setMessage(''); })}>Sign out</button>
      </div>

      {loadingAccount && <p>Checking protected account state…</p>}
      {message && <p className="account-access-message">{message}</p>}

      {account && <>
        <dl className="account-identity-grid">
          <div><dt>Account ID</dt><dd>{account.userId}</dd></div>
          <div><dt>Email</dt><dd>{account.email}</dd></div>
          <div><dt>Role</dt><dd>{account.role ?? 'Not chosen'}</dd></div>
          <div><dt>Status</dt><dd>{account.status}</dd></div>
        </dl>

        {!account.admin && !account.role && <div className="account-role-picker">
          <p>Choose the permanent role for this legacy Nightjar account. New accounts choose this before registration.</p>
          <div>
            <button className="secondary-button" disabled={loadingAccount} onClick={() => void chooseRole('listener')}>Listener</button>
            <button className="secondary-button" disabled={loadingAccount} onClick={() => void chooseRole('creator')}>Creator</button>
            <button className="secondary-button" disabled={loadingAccount} onClick={() => void chooseRole('writer')}>Writer</button>
            <button className="secondary-button" disabled={loadingAccount} onClick={() => void chooseRole('editor')}>Audio Editor</button>
          </div>
        </div>}
      </>}
    </section>}
  </main>;
}
