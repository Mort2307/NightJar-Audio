import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Fingerprint, RefreshCw, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { nightjarAdministration, type AdminDiditMemberCase, type AdminDiditMemberSummary, type AdminDiditExistingResult } from '../platform/firebase-administration';
import './admin-didit-member-ops.css';

type Scope = 'attention' | 'all' | 'verified' | 'not-started';

const diagnosticGuidance: Record<AdminDiditMemberCase['outcome'],string> = {
  verified: 'Live 18+ evidence accepted and saved on this Nightjar account. No new check is required.',
  no_account_session: 'No account-linked Didit session found. Check the account used for the original verification; do not start another paid check.',
  session_binding_missing: 'The stored session does not match this account and the configured live Didit workflow. Investigate binding before changing anything.',
  awaiting_signed_webhook: 'Nightjar has not recorded a signed status or data webhook for this session. Check the existing provider decision using the safe recheck below.',
  webhook_waiting_for_processing: 'Nightjar received a signed webhook, but its processing has not completed. Review backend retry logs.',
  webhook_ignored_or_superseded: 'A signed webhook was ignored or superseded. Inspect the account linkage and event order.',
  adult_evidence_missing: 'An overall Approved event was recorded, but approved documentary 18+ evidence was missing. Check the individual ID step in Didit.',
  provider_result_not_verified: 'Nightjar has not accepted a validated adult decision. Inspect the provider status before trying the existing-result recheck.',
};

function resultGuidance(result: AdminDiditExistingResult) {
  if (result.verified) return result.outcome === 'already_verified'
    ? 'Already verified. No additional check or professional approval was made.'
    : 'Validated existing Didit 18+ approval recorded on this account. Professional roles still require your separate approval.';
  if (result.outcome === 'adult_evidence_missing')
    return 'Didit reports an overall approval but the individual ID verification has not supplied approved, valid 18+ documentary evidence. Review that feature in Didit before rechecking.';
  if (result.outcome === 'provider_not_approved')
    return 'The existing Didit decision is not Approved yet. Check its overall session status and any manual-review requirements.';
  return 'Nightjar cannot find a reconcilable live Didit session for this account. Do not initiate another paid session.';
}

export default function AdminDiditMemberOps({ onVerified }: { onVerified?: () => void }) {
  const [members, setMembers] = useState<AdminDiditMemberSummary[]>([]);
  const [limited, setLimited] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<AdminDiditMemberCase | null>(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('attention');
  const [loading, setLoading] = useState(true);
  const [inspecting, setInspecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checkedAt, setCheckedAt] = useState('');
  const [lastDecision, setLastDecision] = useState<AdminDiditExistingResult | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await nightjarAdministration.listDiditMemberCases();
      setMembers(result.members ?? []);
      setLimited(result.limited === true);
      setCheckedAt(new Date().toISOString());
    } catch {
      setError('Could not load the live verification directory. Refresh your administrator sign-in and retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => members.filter(member => {
    const text = query.trim().toLowerCase();
    if (text && ![member.email, member.userId].some(value => value.toLowerCase().includes(text))) return false;
    if (scope === 'verified') return member.providerVerified;
    if (scope === 'not-started') return !member.providerVerified && !member.sessionRecorded;
    if (scope === 'attention') return !member.providerVerified && member.sessionRecorded;
    return true;
  }), [members, query, scope]);

  const selected = members.find(member => member.userId === selectedId);

  const inspect = async (userId: string) => {
    setSelectedId(userId);
    setDetail(null);
    setLastDecision(null);
    setError('');
    setNotice('');
    setInspecting(true);
    try {
      setDetail(await nightjarAdministration.inspectDiditMemberCase(userId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not inspect this Nightjar-linked verification.');
    } finally {
      setInspecting(false);
    }
  };

  const sync = async () => {
    if (!selected || !detail || !detail.sessionRecorded || !detail.sessionBound || detail.providerVerified || syncing) return;
    if (!window.confirm('Re-read ONLY the existing live Didit decision for ' + selected.email + '? This does not create or charge for a new ID session. Nightjar will save Verified 18+ ONLY if the current provider result contains approved, account-matched documentary adult evidence. Professional approval remains separate.')) return;
    setSyncing(true);
    setNotice('');
    setError('');
    setLastDecision(null);
    try {
      const result = await nightjarAdministration.syncApplicantExistingDidit(selected.userId);
      setLastDecision(result);
      setNotice(resultGuidance(result));
      // Refresh the inspected evidence and the directory without creating
      // another provider session or automatically granting professional roles.
      const [newDetail, newDirectory] = await Promise.all([
        nightjarAdministration.inspectDiditMemberCase(selected.userId),
        nightjarAdministration.listDiditMemberCases(),
      ]);
      setDetail(newDetail);
      setMembers(newDirectory.members ?? []);
      setLimited(newDirectory.limited === true);
      setCheckedAt(new Date().toISOString());
      if (result.verified) onVerified?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The existing Didit result could not be safely reconciled. No new check was started.');
    } finally {
      setSyncing(false);
    }
  };

  const awaiting = members.filter(member => member.sessionRecorded && !member.providerVerified).length;
  const confirmed = members.filter(member => member.providerVerified).length;

  return <section className="nj-didit-members" aria-label="Nightjar member verification operations">
    <div className="nj-didit-members-heading">
      <div><span className="mini-label">OWNER ONLY · DIDIT OPERATIONS</span><h3>Member verification desk</h3>
        <p>Find a tester or member, inspect the account-bound verification and securely check their existing Didit decision. This never launches a paid check or approves a professional role.</p>
      </div>
      <button type="button" className="secondary-button" disabled={loading || syncing} onClick={() => void load()}>
        <RefreshCw size={16}/>{loading ? 'Checking members…' : 'Refresh member directory'}
      </button>
    </div>
    <div className="nj-didit-members-stats">
      <span><strong>{awaiting}</strong><small>Linked checks not verified</small></span>
      <span><strong>{confirmed}</strong><small>Verified 18+ records</small></span>
      <span><strong>{members.length}</strong><small>Accounts listed</small></span>
    </div>
    {limited && <p className="access-note">Directory capped at 300 accounts. A wider search requires server-side pagination; these are not all Nightjar accounts.</p>}
    <div className="nj-didit-members-layout">
      <div className="nj-didit-members-browser">
        <label htmlFor="nightjar-didit-member-search"><Search size={15}/> Find a member</label>
        <input id="nightjar-didit-member-search" type="search" autoComplete="off" placeholder="Search email or account reference" value={query} onChange={event => setQuery(event.target.value)}/>
        <div className="nj-didit-members-filters" role="group" aria-label="Verification status filter">
          {([
            ['attention','Needs review'],['all','All'],['verified','Verified'],['not-started','Not started'],
          ] as const).map(([key,title])=><button key={key} type="button" className={scope === key ? 'active' : ''} aria-pressed={scope === key} onClick={()=>setScope(key)}>{title}</button>)}
        </div>
        <p className="nj-didit-muted" role="status">{filtered.length} matching account{filtered.length === 1 ? '' : 's'}</p>
        <div className="nj-didit-member-list">
          {filtered.slice(0,100).map(member=><button type="button" key={member.userId} className={'nj-didit-member-choice' + (selectedId === member.userId ? ' selected' : '')} aria-pressed={selectedId === member.userId} onClick={()=>void inspect(member.userId)}>
            <strong>{member.email || 'Nightjar member'}</strong>
            <span>{member.providerVerified ? 'Verified 18+' : member.sessionRecorded ? 'Linked session · not verified' : 'No linked check'} · {member.providerStatus.replaceAll('_',' ')}</span>
          </button>)}
          {!loading && filtered.length === 0 && <p className="nj-didit-muted">No accounts match this filter.</p>}
          {filtered.length > 100 && <p className="nj-didit-muted">Showing the first 100 matches. Narrow the search to find a specific member.</p>}
        </div>
      </div>
      <div className="nj-didit-member-inspection">
        {!selected && <div className="nj-didit-members-placeholder"><Fingerprint size={24}/><strong>Select an account</strong><span>Review its verification status, secure session link, webhook activity and existing-result recovery options.</span></div>}
        {selected && <>
          <div className="nj-didit-case-title"><div><strong>{selected.email || 'Selected member'}</strong><span>Account verification investigation</span></div>
            <button className="secondary-button" type="button" disabled={inspecting || syncing} onClick={()=>void inspect(selected.userId)}><RefreshCw size={15}/>Inspect</button>
          </div>
          {inspecting && <p role="status">Reading account-linked evidence…</p>}
          {detail && <>
            <div className={'nj-didit-case-verdict ' + (detail.providerVerified ? 'verified' : 'attention')}>
              {detail.providerVerified ? <CheckCircle2 size={22}/> : <ShieldAlert size={22}/>}
              <div><strong>{detail.providerVerified ? 'VERIFIED 18+' : 'Not yet verified 18+'}</strong><span>{diagnosticGuidance[detail.outcome]}</span></div>
            </div>
            <dl className="nj-didit-case-fields">
              <div><dt>Nightjar stored status</dt><dd>{detail.providerStatus.replaceAll('_',' ')}</dd></div>
              <div><dt>Existing session</dt><dd>{detail.sessionRecorded ? 'Recorded' : 'Not recorded'}</dd></div>
              <div><dt>Account/workflow binding</dt><dd>{detail.sessionBound ? 'Confirmed' : 'Not confirmed'}</dd></div>
              <div><dt>Last saved provider session status</dt><dd>{detail.sessionStatus ?? 'Unavailable'}</dd></div>
              <div><dt>Signed webhook</dt><dd>{detail.signedWebhookReceived ? 'Received' : 'Not recorded'}</dd></div>
              <div><dt>Webhook processing</dt><dd>{detail.webhookProcessed ? detail.webhookIgnored ? 'Ignored / superseded' : 'Completed' : 'Not confirmed'}</dd></div>
              <div><dt>Signed adult evidence</dt><dd>{detail.adultEvidenceConfirmed ? 'Present' : 'Not confirmed'}</dd></div>
              <div><dt>Last signed decision</dt><dd>{detail.lastSignedWebhookStatus ?? 'Not recorded'}</dd></div>
            </dl>
            {detail.lastWebhookReceivedAt && <p className="nj-didit-muted">Last signed webhook: {new Date(detail.lastWebhookReceivedAt).toLocaleString('en-GB')}</p>}
            <div className="nj-didit-case-actions">
              <button type="button" className="primary-button" disabled={syncing || inspecting || detail.providerVerified || !detail.sessionBound} onClick={()=>void sync()}>
                <ShieldCheck size={17}/>{syncing ? 'Validating existing decision…' : 'Sync existing Didit result · no new check'}
              </button>
              <a href="https://business.didit.me/sign-in" target="_blank" rel="noopener noreferrer" className="secondary-button">Review in Didit <ExternalLink size={14}/></a>
            </div>
            {!detail.sessionBound && <p className="nj-didit-muted">Safe synchronisation requires the original session to match this account and the live Didit workflow.</p>}
            {lastDecision && <p className="nj-didit-muted">Provider session: {lastDecision.providerStatus ?? 'No confirmed approval'} · Individual ID checks: {lastDecision.idFeatureStatuses?.join(', ') || 'Not available'}</p>}
            {notice && <p className="nj-didit-case-notice" role="status">{notice}</p>}
          </>}
        </>}
      </div>
    </div>
    {error && <p className="access-note" role="alert">{error}</p>}
    <p className="nj-didit-muted">{checkedAt ? 'Directory last refreshed ' + new Date(checkedAt).toLocaleString('en-GB') + '. ' : ''}No raw IDs, dates of birth, selfie images or full Didit decisions are displayed or saved by this panel. Final professional approval remains owner-controlled.</p>
  </section>;
}
