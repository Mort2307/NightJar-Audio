import { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, ChevronDown, Clock3, HelpCircle, KeyRound, RefreshCw, ShieldCheck, UserRoundCheck } from 'lucide-react';
import type { AuthenticationSecurityEvent } from '../platform/firebase-auth-security';

type Props = {
  events: AuthenticationSecurityEvent[];
  loading: boolean;
  onRefresh: () => void;
  onAssistance: (email: string) => void;
};

type Group = {
  key: string;
  events: AuthenticationSecurityEvent[];
  latest: AuthenticationSecurityEvent;
  owner: NonNullable<AuthenticationSecurityEvent['accountOwner']> | null;
};

const formatWhen = (value: string | null | undefined) => {
  if (!value) return 'Time unavailable';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Time unavailable' : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
};

const explain = (event: AuthenticationSecurityEvent) => {
  if (event.eventType === 'closed_beta_signin_denied' || event.firebaseCode === 'closed_beta_not_invited') {
    return 'The email entered does not have permission to use Nightjar during private testing.';
  }
  if (event.firebaseCode === 'auth/too-many-requests') {
    return 'Firebase temporarily restricted further attempts after too many sign-in requests. Nightjar cannot remove that provider restriction.';
  }
  if (event.firebaseCode === 'auth/invalid-credential') {
    return 'The email and password combination was not accepted. A mistyped or forgotten password is one possibility.';
  }
  if (event.firebaseCode === 'auth/user-disabled') {
    return 'Firebase rejected access because the account is disabled.';
  }
  if (event.firebaseCode === 'auth/invalid-email') {
    return 'The email address entered was not valid.';
  }
  return 'Nightjar recorded an unsuccessful or blocked attempt. The exact cause is not available.';
};

const nextStep = (events: AuthenticationSecurityEvent[], eligible: boolean) => {
  if (events.some(e => e.firebaseCode === 'auth/too-many-requests')) {
    return 'Avoid repeated retries. Firebase may require waiting. If the member contacts you, check their account and offer normal account recovery.';
  }
  if (events.some(e => e.eventType === 'closed_beta_signin_denied')) {
    return 'Check whether the address should be on the approved tester list. Do not grant access from the failed attempt alone.';
  }
  if (eligible) return 'If the account holder contacts Nightjar, open Assistance to check their access and offer a secure password-reset link if appropriate.';
  return 'The submitted email alone does not identify a person. Wait for an independently verified support request before contacting anyone.';
};

export default function AdminAuthenticationLog({ events, loading, onRefresh, onAssistance }: Props) {
  const [showAll, setShowAll] = useState(false);
  const groups = useMemo<Group[]>(() => {
    const byKey = new Map<string, AuthenticationSecurityEvent[]>();
    for (const event of events) {
      // Never group by masked emails: different addresses can have the same mask.
      const key = event.targetKey || event.id;
      byKey.set(key, [...(byKey.get(key) ?? []), event]);
    }
    return Array.from(byKey, ([key, items]) => ({
      key,
      events: items.slice().sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))),
      latest: items.slice().sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0],
      owner: items.find(item => item.accountOwner)?.accountOwner ?? null,
    })).sort((a,b) => String(b.latest.createdAt ?? '').localeCompare(String(a.latest.createdAt ?? '')));
  }, [events]);
  const visible = showAll ? groups : groups.slice(0, 5);
  const eligibleAccounts = groups.filter(g => g.owner).length;
  return <section className="security-alert-panel nj-auth-cases" aria-label="Sign-in help and security activity">
    <header className="nj-auth-head">
      <div><span className="mini-label">SECURITY / ACCOUNT ACCESS</span><h2>Who is having sign-in trouble?</h2>
        <p>Failed attempts are grouped by the exact email entered, rather than filling this page with technical logs. Start with the explanation and recommended next step.</p>
      </div>
      <button type="button" className="secondary-button" onClick={onRefresh} disabled={loading}><RefreshCw size={16}/>{loading ? 'Checking…' : 'Refresh sign-ins'}</button>
    </header>
    <div className="nj-auth-overview">
      <div><strong>{groups.length}</strong><span>Different email addresses</span></div>
      <div><strong>{events.length}</strong><span>Recorded failed or blocked attempts</span></div>
      <div><strong>{eligibleAccounts}</strong><span>Verified Nightjar members you can assist</span></div>
    </div>
    <p className="nj-auth-disclaimer"><ShieldCheck size={17}/> An email address in a failed login identifies the account being targeted, <strong>not who tried to sign in</strong>. These records do not prove that anyone gained access. Nightjar records attempts seen through its own sign-in page only.</p>
    {!groups.length ? <div className="people-empty"><CheckCircle2 size={18}/><strong>No failed sign-ins to review</strong><span>Failed or beta-blocked sign-ins will appear here.</span></div> :
    <div className="nj-auth-case-list">
      {visible.map(g => <article className="nj-auth-case" key={g.key}>
        <div className="nj-auth-case-top"><span className="nj-auth-pill"><AlertCircle size={15}/>{g.events.length} attempt{g.events.length === 1 ? '' : 's'}</span><span><Clock3 size={14}/>{formatWhen(g.latest.createdAt)}</span></div>
        <h3>{g.owner ? g.owner.name : g.latest.adminTarget ? 'Nightjar owner email was entered' : 'Person not identified'}</h3>
        <p className="nj-auth-target">{g.owner ? g.owner.email : 'Email entered: ' + g.latest.targetEmailMasked}</p>
        <p className="nj-auth-identity">{g.owner
          ? <><UserRoundCheck size={16}/> This is a registered and authorised member's account. <strong>We cannot tell if they personally made the attempts.</strong></>
          : <><HelpCircle size={16}/> No currently verified and authorised member was matched for contact. The person who typed the email is unknown.</>}</p>
        <div className="nj-auth-explanation"><strong>What happened?</strong><p>{explain(g.latest)}</p></div>
        <div className="nj-auth-next"><strong>What should you do?</strong><p>{nextStep(g.events, Boolean(g.owner))}</p></div>
        {g.owner && <button className="primary-button nj-auth-assist" type="button" onClick={() => onAssistance(g.owner!.email)}><KeyRound size={16}/> Open member assistance <ArrowRight size={15}/></button>}
        <details className="nj-auth-records">
          <summary>See {g.events.length} recorded attempt{g.events.length === 1 ? '' : 's'} <ChevronDown size={16}/></summary>
          <div className="nj-auth-record-list">{g.events.map(e => <div className="nj-auth-record" key={e.id}>
            <strong>{formatWhen(e.createdAt)}</strong><span>{explain(e)}</span>
            <details><summary>Technical details</summary>
              <dl><div><dt>Firebase response</dt><dd>{e.firebaseCode ?? 'Not available'}</dd></div>
                <div><dt>Account portal route</dt><dd>{e.route ?? 'Not available'}</dd></div>
                <div><dt>Browser description</dt><dd>{e.clientPlatform ?? 'Not available'}</dd></div>
                <div><dt>Browser identifier</dt><dd>{e.clientAttemptId ?? 'Not available'}</dd></div>
              </dl><p>A browser identifier cannot prove who the person is. No passwords are collected.</p>
            </details>
          </div>)}</div>
        </details>
      </article>)}
    </div>}
    {!showAll && groups.length > 5 && <button type="button" className="secondary-button nj-auth-more" onClick={()=>setShowAll(true)}>Show all {groups.length} affected email addresses <ArrowRight size={16}/></button>}
    {showAll && groups.length > 5 && <button type="button" className="ghost-button nj-auth-more" onClick={()=>setShowAll(false)}>Show just the five most recent</button>}
  </section>;
}
