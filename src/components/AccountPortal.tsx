import { useEffect, useState } from 'react';
import { Moon, ShieldCheck } from 'lucide-react';
import AccountAccess from './AccountAccess';
import { nightjarAuth, type NightjarIdentity } from '../platform/firebase-auth';
import { nightjarAccount, type NightjarAccountIdentity } from '../platform/firebase-account';

export default function AccountPortal() {
  const [identity, setIdentity] = useState<NightjarIdentity | null>(() => nightjarAuth.current());
  const [account, setAccount] = useState<NightjarAccountIdentity | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [message, setMessage] = useState('');

  const loadAccount = async (nextIdentity: NightjarIdentity | null) => {
    if (!nextIdentity?.emailVerified) {
      setAccount(null);
      return;
    }
    setLoadingAccount(true);
    setMessage('');
    try {
      setAccount(await nightjarAccount.identity());
    } catch {
      setAccount(null);
      setMessage('Your Firebase identity is valid, but the Nightjar backend account service is not available yet.');
    } finally {
      setLoadingAccount(false);
    }
  };

  useEffect(() => nightjarAuth.observe((next) => {
    setIdentity(next);
    void loadAccount(next);
  }), []);

  const chooseRole = async (role: 'listener' | 'creator' | 'writer') => {
    setLoadingAccount(true);
    setMessage('');
    try {
      await nightjarAccount.chooseRole(role);
      setAccount(await nightjarAccount.identity());
    } catch {
      setMessage('Nightjar could not save that account role.');
    } finally {
      setLoadingAccount(false);
    }
  };

  return <main className="account-portal-shell">
    <header className="account-portal-header">
      <a href="/discover" className="account-portal-brand"><Moon size={20} /> Nightjar</a>
      <span>Secure account access</span>
    </header>

    <AccountAccess
      key={(identity?.userId ?? 'guest') + ':' + String(identity?.emailVerified ?? false)}
      identity={identity}
      onAuthenticated={(next) => {
        setIdentity(next);
        void loadAccount(next);
      }}
      onSignedOut={() => {
        setIdentity(null);
        setAccount(null);
      }}
    />

    {identity?.emailVerified && <section className="account-backend-card">
      <div className="account-backend-heading">
        <ShieldCheck size={19} />
        <div>
          <strong>Verified Nightjar identity</strong>
          <span>Firebase Authentication → trusted Nightjar backend</span>
        </div>
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
          <p>Choose the permanent role for this Nightjar account.</p>
          <div>
            <button className="secondary-button" disabled={loadingAccount} onClick={() => void chooseRole('listener')}>Listener</button>
            <button className="secondary-button" disabled={loadingAccount} onClick={() => void chooseRole('creator')}>Creator</button>
            <button className="secondary-button" disabled={loadingAccount} onClick={() => void chooseRole('writer')}>Writer</button>
          </div>
        </div>}
      </>}
    </section>}
  </main>;
}
