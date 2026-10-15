import { useMemo, useState } from 'react';
import { CheckCircle2, Eye, LockKeyhole, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { nightjarAdministration, type NightjarSecurityDossier } from '../platform/firebase-administration';
import './admin-member-safety.css';

export type SafetyMember = {
  userId: string;
  name?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
  handle?: string | null;
  role?: string | null;
  status?: string | null;
};

type SafetyAction = 'suspend' | 'restore';
type SafetyResult = { status: string; authDisabled: boolean; revokedReaderSessions: number; caseId?: string; notificationDelivery?: 'sent' | 'pending' };

export default function AdminMemberSafety({
  accounts, onAction, onRefresh, onOpenProfile, loading = false,
}: {
  accounts: SafetyMember[];
  onAction: (account: SafetyMember, action: SafetyAction, reason: string) => Promise<SafetyResult>;
  onRefresh: () => void;
  onOpenProfile?: (userId: string) => void;
  loading?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dossier, setDossier] = useState<NightjarSecurityDossier | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const matches = useMemo(() => {
    const value = query.trim().toLowerCase().replace(/^@/, '');
    if (!value) return [];
    return accounts.filter(item => [item.name, item.email, item.handle, item.userId]
      .some(field => String(field ?? '').toLowerCase().replace(/^@/, '').includes(value))).slice(0, 20);
  }, [accounts, query]);
  const selected = accounts.find(item => item.userId === selectedId);
  const suspended = selected?.status === 'suspended';
  const choose = (account: SafetyMember) => {
    setSelectedId(account.userId);
    setReason('');
    setError('');
    setSuccess('');
    setDossier(null);
  };
  const inspect = async () => {
    if (!selected || dossierLoading) return;
    setDossierLoading(true);
    setError('');
    try { setDossier(await nightjarAdministration.memberSecurityDossier(selected.userId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load verified security evidence.'); }
    finally { setDossierLoading(false); }
  };
  const apply = async (action: SafetyAction) => {
    if (!selected || busy || reason.trim().length < 12) return;
    const title = selected.name || selected.email || selected.userId;
    if (!window.confirm((action === 'suspend'
      ? 'Disable Firebase sign-in and revoke sessions for '
      : 'Restore Firebase sign-in for ') + title + '?\n\nThis administrative decision is recorded and must be supported by your case note.')) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await onAction(selected, action, reason.trim());
      setSuccess(action === 'suspend'
        ? 'Suspension confirmed by the server: Firebase login disabled, refresh tokens revoked, and ' + result.revokedReaderSessions + ' manuscript session(s) revoked.'
        : 'Restoration confirmed by the server: Firebase login enabled and account status ' + result.status + '.');
      setReason('');
      setSuccess((action === 'suspend' ? 'Account suspended' : 'Account restored') +
        (result.caseId ? ' · case ' + result.caseId : '') + '. Firebase access: ' +
        (result.authDisabled ? 'disabled' : 'enabled') + '. Member notification: ' +
        (result.notificationDelivery === 'sent' ? 'email sent' : result.notificationDelivery === 'pending' ? 'delivery pending — review Nightjar Mail connection' : 'not sent (demo mode)') + '.');
      setDossier(null); // Refresh the authoritative Firebase status after any action.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The security action failed. Nothing has been confirmed.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="admin-panel nj-member-safety" id="nightjar-member-safety" aria-label="Find and suspend a Nightjar member">
    <span className="mini-label"><ShieldAlert size={16}/> OWNER SECURITY / MEMBER LOCKOUT</span>
    <h2>Find a member and control access</h2>
    <p>Search by display name, email, @handle or account ID. Suspensions require a case note and explicit confirmation. A keyboard or screenshot signal alone is not proof of misconduct.</p>
    <div className="nj-member-safety-search">
      <label htmlFor="nj-member-safety-search">Find account</label>
      <div className="nj-member-safety-search-row">
        <Search size={17} aria-hidden="true"/>
        <input id="nj-member-safety-search" type="search" autoComplete="off" value={query}
          onChange={event => { setQuery(event.target.value); setSelectedId(''); setDossier(null); setError(''); setSuccess(''); }}
          placeholder="Name, email, @handle or user ID"/>
        <button type="button" className="secondary-button" disabled={loading} onClick={onRefresh}>Refresh</button>
      </div>
    </div>
    {query.trim().length > 0 && <div className="nj-member-safety-results" aria-label="Matching Nightjar accounts">
      {matches.length ? matches.map(account => <button type="button" key={account.userId}
        className={account.userId === selectedId ? 'nj-member-safety-result selected' : 'nj-member-safety-result'}
        aria-pressed={account.userId === selectedId} onClick={() => choose(account)}>
        <span className="nj-member-safety-ident"><span className="nj-member-safety-avatar">{account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : (account.name || 'N').charAt(0).toUpperCase()}</span><span><strong>{account.name || 'Nightjar member'}</strong><small>{account.email || account.userId}{account.handle ? ' · @' + account.handle.replace(/^@/, '') : ''}</small></span></span>
        <em>{account.status === 'suspended' ? 'SUSPENDED' : account.status === 'pending_review' ? 'PENDING REVIEW' : 'ACTIVE'}</em>
      </button>) : <p>No account matched. Verify the spelling or refresh the account directory.</p>}
      {matches.length === 20 && <small>Showing the first 20 matches. Add more of the name or email to narrow the list.</small>}
    </div>}
    {selected && <div className="nj-member-safety-case">
      <div className="nj-member-safety-preview"><span className="nj-member-safety-avatar large">{selected.avatarUrl ? <img src={selected.avatarUrl} alt="" /> : (selected.name || 'N').charAt(0).toUpperCase()}</span><div><h3><LockKeyhole size={18}/> {selected.name || 'Nightjar member'}</h3><p>{selected.email || selected.userId}{selected.handle ? ' · @'+selected.handle.replace(/^@/,'') : ''} · {selected.role || 'member'} · <strong>{selected.status || 'active'}</strong></p></div></div>
      {onOpenProfile && <button type="button" className="secondary-button" onClick={() => onOpenProfile(selected.userId)}><Eye size={16}/> Preview member profile</button>}
      <button type="button" className="secondary-button" disabled={dossierLoading} onClick={() => void inspect()}>
        <ShieldCheck size={16}/> {dossierLoading ? 'Checking Firebase and security history…' : 'Review account and security evidence'}
      </button>
      {dossier && dossier.member.userId === selected.userId && <div className="nj-member-safety-dossier">
        <h3>Verified account information</h3>
        <p><strong>Firebase sign-in:</strong> {dossier.member.authDisabled ? 'Disabled' : 'Enabled'} · <strong>Nightjar status:</strong> {dossier.member.status}</p>
        {dossier.member.suspensionCaseId && <p>Case reference: <strong>{dossier.member.suspensionCaseId}</strong></p>}
        {dossier.member.status === 'suspended' && <div className="nj-member-safety-actions">
          <p><strong>Member notice:</strong> {dossier.member.notificationDelivery === 'sent' ? 'Email sent' : 'Pending delivery / Nightjar Mail may be disconnected'}</p>
          {dossier.member.notificationDelivery !== 'sent' && <button type="button" className="secondary-button" disabled={dossierLoading} onClick={() => {
            if (!selected || !window.confirm('Retry the recorded suspension notice to this member\'s verified email?')) return;
            setDossierLoading(true);
            void nightjarAdministration.retryMemberSecurityNotice(selected.userId).then((result) => {
              setSuccess(result.notificationDelivery === 'sent' ? 'Suspension email delivered.' : 'Suspension email remains pending; check Nightjar Mail connection.');
              return nightjarAdministration.memberSecurityDossier(selected.userId);
            }).then(setDossier).catch((error) => setError(error instanceof Error ? error.message : 'Unable to retry the security notice.'))
              .finally(() => setDossierLoading(false));
          }}>Retry member notification</button>}
        </div>}
        {dossier.member.suspensionReason && <p>Recorded suspension reason: {dossier.member.suspensionReason}</p>}
        <p>{dossier.note}</p>
        <details>
          <summary>Recent security evidence ({dossier.evidence.length})</summary>
          {dossier.evidence.length ? dossier.evidence.map(item => <article key={item.id} className="nj-member-safety-evidence">
            <strong>{item.eventType.replaceAll('_', ' ')}</strong>
            <small>{item.createdAt ? new Date(item.createdAt).toLocaleString('en-GB') : 'Time not available'} · {item.detectionConfidence || 'Contextual'} · {item.route || 'Protected reader'}</small>
            <span>{item.summary || 'Security signal recorded.'}</span>
          </article>) : <p>No account-linked events recorded in the available history. This does not prove no screenshots occurred.</p>}
        </details>
      </div>}
      <label htmlFor="nj-member-safety-reason">Case note (required, at least 12 characters)</label>
      <textarea id="nj-member-safety-reason" rows={3} maxLength={500} value={reason}
        onChange={event => setReason(event.target.value)}
        placeholder={suspended ? 'Why is it appropriate to restore access?' : 'Evidence, report reference or reason for precautionary suspension'}/>
      <div className="nj-member-safety-actions">
        {suspended ? <button className="primary-button" type="button" disabled={busy || reason.trim().length < 12} onClick={() => void apply('restore')}>
          <ShieldCheck size={16}/> {busy ? 'Restoring…' : 'Restore member access'}
        </button> : <button className="danger-button" type="button" disabled={busy || reason.trim().length < 12} onClick={() => void apply('suspend')}>
          <LockKeyhole size={16}/> {busy ? 'Suspending…' : 'Suspend member access'}
        </button>}
      </div>
    </div>}
    {error && <p className="nj-member-safety-error" role="alert">{error}</p>}
    {success && <p className="nj-member-safety-success" role="status"><CheckCircle2 size={17}/> {success}</p>}
    <small>Security events record action types and contextual routes—not raw keystrokes, passwords, form contents or private messages. Manual review is always required before suspension.</small>
  </section>;
}
