import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import AccountAccess from './AccountAccess';
import ProductExperience from './ProductExperience';
import AppUpdateControl from './AppUpdateControl';
import MemberSecurityGate from './MemberSecurityGate';
import { nightjarLegal } from '../platform/firebase-legal';
import { nightjarAuth, type NightjarIdentity } from '../platform/firebase-auth';
import { nightjarAccount, type NightjarAccountIdentity } from '../platform/firebase-account';
import { nightjarMedia } from '../platform/firebase-media';
import { markPasswordAuthenticated } from './NightjarLaunchUnlock';

const accountDestination = (account: NightjarAccountIdentity) => {
  if (account.admin || account.role === 'admin') return '/admin';
  if (account.role === 'creator') return '/creator';
  if (account.role === 'writer') return '/writer';
  if (account.role === 'editor') return '/editor';
  if (account.role === 'artist') return '/profile';
  if (account.role === 'listener') return '/discover';
  return null;
};

// Only a contributor claim deep-link may override the normal account home.
// No arbitrary external URL, auth result, email or role may be supplied here.
const invitedCreditDestination = (raw: string | null) => {
  if (!raw || raw.length > 520) return null;
  try {
    const destination = new URL(raw, 'https://nightjar-audio.web.app');
    if (destination.origin !== 'https://nightjar-audio.web.app' ||
        destination.pathname !== '/profile/credits') return null;
    const params = destination.searchParams;
    const release = params.get('creditRelease'),slot = params.get('creditSlot');
    if (!release || !slot || !/^[A-Za-z0-9_-]{1,160}$/.test(release) ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(slot)) return null;
    if ([...params.keys()].some(key=>!['creditRelease','creditSlot'].includes(key))) return null;
    return '/profile/credits?creditRelease='+encodeURIComponent(release)+'&creditSlot='+encodeURIComponent(slot);
  } catch { return null; }
};

export default function AccountPortal() {
  const [explicitSignIn] = useState(() => new URLSearchParams(window.location.search).get('entry') === 'signin');
  const [creditContinue] = useState(() => invitedCreditDestination(new URLSearchParams(window.location.search).get('returnTo')));
  const [identity, setIdentity] = useState<NightjarIdentity | null>(() => nightjarAuth.current());
  const [authReady, setAuthReady] = useState(false);
  const [account, setAccount] = useState<NightjarAccountIdentity | null>(null);
  const [agreementsOutstanding, setAgreementsOutstanding] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [message, setMessage] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const activeAccountLoadRef = useRef<{ userId: string; enterApp: boolean } | null>(null);
  const [accountProgress, setAccountProgress] = useState('Checking your Nightjar account…');

  const loadAccount = async (nextIdentity: NightjarIdentity | null, enterApp = false) => {
    if (!nextIdentity?.emailVerified) {
      setAccount(null);
      return;
    }
    // Firebase auth observation and the form's success callback can fire
    // for the same sign-in. Coalesce them into a single backend account lookup,
    // retaining the stronger request to continue into the app.
    if (activeAccountLoadRef.current?.userId === nextIdentity.userId) {
      if (enterApp) activeAccountLoadRef.current.enterApp = true;
      return;
    }
    const request = { userId: nextIdentity.userId, enterApp };
    activeAccountLoadRef.current = request;
    setLoadingAccount(true);
    setAccountProgress('Checking your account permissions…');
    setMessage('');
    try {
      // Callable functions fetch a valid Firebase token automatically.
      // Forcing a fresh network token on every login added an avoidable round trip.
      // Email verification already refreshes the token when it changes.
      let nextAccount = await nightjarAccount.identity();
      if (nightjarAuth.current()?.userId !== request.userId) return;
      if (nextAccount.status === 'suspended') {
        setAccount(nextAccount);
        setMessage('Your Nightjar account is suspended. ' + (nextAccount.suspensionReason || 'Contact Nightjar Support to request a review.') +
          (nextAccount.suspensionCaseId ? ' Case: ' + nextAccount.suspensionCaseId : ''));
        return;
      }
      // Check BEFORE chooseRole: registration must not bypass versioned terms,
      // and a new member must be able to accept them before role creation.
      const agreements = await nightjarLegal.status();
      if ((agreements.documents ?? []).some(doc => doc.requiredForAccount && !doc.accepted)) {
        setAccount(nextAccount);
        setAgreementsOutstanding(true);
        return;
      }
      setAgreementsOutstanding(false);
      const pendingRole = sessionStorage.getItem('nightjar.registrationRole') as 'listener' | 'creator' | 'writer' | 'editor' | 'artist' | null;
      const referralCode = sessionStorage.getItem('nightjar.creatorReferralCode') ?? '';
      if (!nextAccount.admin && !nextAccount.role && pendingRole && ['listener','creator','writer','editor','artist'].includes(pendingRole)) {
        setAccountProgress('Preparing your Nightjar workspace…');
        await nightjarAccount.chooseRole(pendingRole, referralCode);
        nextAccount = await nightjarAccount.identity();
      }
      if (nightjarAuth.current()?.userId !== request.userId) return;
      if (nextAccount.role) {
        sessionStorage.removeItem('nightjar.registrationRole');
        sessionStorage.removeItem('nightjar.creatorReferralCode');
      }
      setAccount(nextAccount);


      if (request.enterApp) {
        const destination = creditContinue ?? accountDestination(nextAccount);
        if (destination) {
          setAccountProgress('Opening your Nightjar workspace…');
          markPasswordAuthenticated(nextIdentity.userId);
          window.location.replace(destination);
          return;
        }
      }
    } catch (error) {
      if (nightjarAuth.current()?.userId !== request.userId) return;
      setAccount(null);
      const detail = error instanceof Error ? error.message : String(error ?? '');
      setMessage(!navigator.onLine
        ? 'You are offline. Nightjar account state is never cached for offline access; reconnect and try again.'
        : detail.includes('Verify your email')
          ? 'Your email is verified in the browser, but Firebase had not refreshed the backend identity token yet. Refresh this page once; Nightjar now forces a fresh token before retrying.'
          : 'You are signed in, but Nightjar could not finish loading your account. Retry below; there is no need to change your password.');
    } finally {
      if (activeAccountLoadRef.current === request) {
        activeAccountLoadRef.current = null;
        setLoadingAccount(false);
      }
    }
  };

  useEffect(() => {
    if (explicitSignIn) {
      window.history.replaceState({}, '', '/account');
    }

    const refreshBranding = () => {
      void nightjarMedia.getBranding().then((data) => {
        const nextLogo = data.logoUrl ?? null;
        setLogoUrl(nextLogo);
        const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
        const touchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
        if (favicon) favicon.href = nextLogo ?? '/brand-logo';
        if (touchIcon) touchIcon.href = nextLogo ?? '/brand-logo';
      }).catch(() => { /* static fallback remains available */ });
    };

    refreshBranding();
    const unsubscribe = nightjarAuth.observe((next) => {
      setAuthReady(true);
      setIdentity(next);
      void loadAccount(next, Boolean(next?.emailVerified) && !explicitSignIn);
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
  }, [explicitSignIn]);

  const chooseRole = async (role: 'listener' | 'creator' | 'writer' | 'editor' | 'artist') => {
    setLoadingAccount(true);
    setMessage('');
    try {
      await nightjarAccount.chooseRole(role, sessionStorage.getItem('nightjar.creatorReferralCode') ?? '');
      const nextAccount = await nightjarAccount.identity();
      setAccount(nextAccount);
      const destination = creditContinue ?? accountDestination(nextAccount);
      if (destination) window.location.replace(destination);
    } catch {
      setMessage('Nightjar could not save that account role.');
    } finally {
      setLoadingAccount(false);
    }
  };

  return <main className="account-portal-shell">
    <ProductExperience allowInstall />
    <header className="account-portal-header">
      <a href="/discover" className="account-portal-brand"><img className="account-portal-logo" src={logoUrl ?? "/brand-logo"} alt="" /> Nightjar</a>
      <div className="account-portal-header-tools"><span>Secure account access</span><AppUpdateControl compact /></div>
    </header>

    {!authReady && <section className="account-backend-card" role="status" aria-live="polite"><p>Checking for your saved Nightjar session…</p></section>}

    {authReady && !identity?.emailVerified && <AccountAccess
      key={(identity?.userId ?? 'guest') + ':' + String(identity?.emailVerified ?? false)}
      identity={identity}
      onAuthenticated={(next) => {
        setIdentity(next);
        void loadAccount(next, true);
      }}
      onSignedOut={() => {
        setIdentity(null);
        setAccount(null);
        setAgreementsOutstanding(false);
      }}
    />}

    {authReady && identity?.emailVerified && agreementsOutstanding && <MemberSecurityGate onComplete={() => {
      setAgreementsOutstanding(false);
      void loadAccount(identity, true);
    }}/>}
    {authReady && identity?.emailVerified && !agreementsOutstanding && <section className="account-backend-card">
      <div className="account-testing-notice"><ShieldCheck size={14}/><span><strong>TESTING BUILD</strong> Age assurance is temporarily disabled for controlled QA. Email verification and protected backend permissions remain active.</span></div>
      <div className="account-backend-heading">
        <ShieldCheck size={19} />
        <div>
          <strong>{explicitSignIn ? 'Choose your Nightjar account' : 'Verified Nightjar identity'}</strong>
          <span>{explicitSignIn ? `You are currently signed in as ${identity.email ?? 'this Firebase account'}.` : 'Firebase Authentication → trusted Nightjar backend'}</span>
        </div>
      </div>

      {explicitSignIn && <div className="account-access-actions">
        <button
          className="primary-button"
          disabled={loadingAccount || !account}
          onClick={() => void loadAccount(identity, true)}
        >
          Continue as {identity.email ?? 'current account'}
        </button>
        <button
          className="secondary-button"
          disabled={loadingAccount}
          onClick={() => void nightjarAuth.signOut().then(() => {
            setIdentity(null);
            setAccount(null);
            setMessage('');
          })}
        >
          Use a different account
        </button>
      </div>}

      {!explicitSignIn && <div className="account-access-actions">
        <button className="ghost-button" onClick={() => void nightjarAuth.signOut().then(() => { setIdentity(null); setAccount(null); setMessage(''); })}>Sign out</button>
      </div>}

      {loadingAccount && <p role="status" aria-live="polite">{accountProgress}</p>}
      {message && <p className="account-access-message" role="status">{message}</p>}
      {message && !loadingAccount && !explicitSignIn && <button type="button" className="secondary-button" onClick={() => void loadAccount(identity, true)}>Retry opening my account</button>}

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
            <button className="secondary-button" disabled={loadingAccount} onClick={() => void chooseRole('artist')}>Artist</button>
          </div>
        </div>}
      </>}
    </section>}
  </main>;
}
