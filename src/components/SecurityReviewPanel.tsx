import { useEffect, useMemo, useState } from 'react';
import { api } from '@appdeploy/client';
import { Ban, Check, ExternalLink, Fingerprint, History, LockKeyhole, RefreshCw, RotateCcw, Search, ShieldAlert, ShieldCheck, UserX } from 'lucide-react';

type Props = {
  notify: (message: string) => void;
  onAccountStateChange?: () => void | Promise<void>;
};

type SecurityAction = 'benign' | 'revoke_sessions' | 'freeze_account' | 'restore_account' | 'remove_account' | 'block_device' | 'block_environment';

export default function SecurityReviewPanel({ notify, onAccountStateChange }: Props) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [traceToken, setTraceToken] = useState('');
  const [traces, setTraces] = useState<any[]>([]);
  const [traceLoading, setTraceLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/security-alerts');
      const items = data?.alerts ?? [];
      setAlerts(items);
      setSelectedId((current) => current && items.some((item: any) => String(item.id) === current) ? current : String(items[0]?.id ?? '') || null);
    } catch {
      notify('Security alerts could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const visibleAlerts = useMemo(
    () => scope === 'all' ? alerts : alerts.filter((alert) => alert.status === 'open'),
    [alerts, scope],
  );
  const selected = alerts.find((alert) => String(alert.id) === selectedId) ?? null;

  const act = async (alert: any, action: SecurityAction) => {
    if (!alert?.id || busyId) return;
    const destructive = action === 'freeze_account' || action === 'remove_account' || action === 'block_device' || action === 'block_environment';
    if (destructive && !window.confirm(action === 'remove_account'
      ? 'Remove this account from Nightjar, revoke protected-reader access and hide its public profile? Security evidence will be retained.'
      : action === 'freeze_account'
        ? 'Freeze this account and revoke all active protected-reader sessions?'
        : action === 'block_environment'
          ? 'Block this broader pseudonymous browser/device environment from opening protected scripts? Shared devices are possible, so use this only when the evidence justifies it.'
          : 'Block this pseudonymous device token from opening protected scripts?')) return;

    const note = action === 'benign'
      ? (window.prompt('Optional review note explaining why this alert is benign') ?? '')
      : destructive
        ? (window.prompt('Administrator review reason for this protective action') ?? '')
        : (window.prompt('Optional administrator note for this action') ?? '');
    if (destructive && !note.trim()) {
      notify('Add a short administrator reason before taking this protective action.');
      return;
    }

    setBusyId(String(alert.id));
    try {
      await api.post('/api/admin/security-alerts/' + encodeURIComponent(String(alert.id)) + '/action', { action, note });
      await load();
      await onAccountStateChange?.();
      notify(action === 'benign'
        ? 'Alert marked benign. No account restriction was applied.'
        : action === 'revoke_sessions'
          ? 'Active protected-reader sessions revoked.'
          : action === 'freeze_account'
            ? 'Account frozen and protected-reader sessions revoked.'
            : action === 'restore_account'
              ? 'Account restored after administrator review.'
              : action === 'block_device'
                ? 'Device token blocked from protected-script access.'
                : action === 'block_environment'
                  ? 'Browser/device environment blocked from protected-script access.'
                  : 'Account removed from Nightjar while security evidence was retained.');
    } catch {
      notify('The security action could not be completed.');
    } finally {
      setBusyId(null);
    }
  };

  const trace = async (input = traceToken) => {
    const token = input.trim().replace(/^.*?FP\s*/i, '').replace(/[^a-f0-9]/gi, '').toUpperCase();
    if (token.length < 8) {
      notify('Enter at least eight characters from the FP forensic token visible in the screenshot.');
      return;
    }
    setTraceToken(token);
    setTraceLoading(true);
    try {
      const { data } = await api.get('/api/admin/security/trace/' + encodeURIComponent(token));
      setTraces(data?.traces ?? []);
      if (!(data?.traces ?? []).length) notify('No protected-reader page matches that forensic token.');
    } catch {
      notify('Forensic token lookup could not be completed.');
    } finally {
      setTraceLoading(false);
    }
  };

  const summary = selected?.evidenceSummary ?? {};
  const linkedOthers = (selected?.linkedAccounts ?? []).filter((item: any) => item.sameAsSubject !== true);
  const linkedEnvironmentOthers = (selected?.linkedEnvironmentAccounts ?? []).filter((item: any) => item.sameAsSubject !== true);

  return <section className="security-review-panel">
    <div className="security-review-head">
      <div><span className="mini-label">SECURITY / ADMIN REVIEW</span><h2>Protected-content alerts</h2><p>Signals create evidence for human review. Nightjar does not automatically freeze accounts from an ordinary screenshot, shared device or single suspicious event.</p></div>
      <button className="secondary-button with-icon" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/>{loading ? 'Refreshing…' : 'Refresh alerts'}</button>
    </div>

    <div className="security-review-principle"><ShieldCheck size={17}/><div><strong>REVIEW FIRST</strong><span>Automatic protection can revoke or pause a protected-reader session when evidence is strong. Whole-account freeze, removal, exact-device blocking and broader environment blocking remain administrator decisions.</span></div></div>

    <div className="security-trace-card">
      <div><Fingerprint size={18}/><span><strong>Trace a leaked screenshot</strong><small>Enter the FP token visible in a protected-page watermark. Nightjar can trace it back to the authorised account, script, reader session and page.</small></span></div>
      <div className="security-trace-form"><input value={traceToken} onChange={(event) => setTraceToken(event.target.value)} placeholder="e.g. 2A91F84C…" aria-label="Forensic screenshot token"/><button className="secondary-button with-icon" onClick={() => void trace()} disabled={traceLoading}><Search size={13}/>{traceLoading ? 'Tracing…' : 'Trace'}</button></div>
      {!!traces.length && <div className="security-trace-results">{traces.map((trace) => <article key={String(trace.forensicToken) + String(trace.sessionId)}><strong>FP {trace.forensicToken}</strong><span>{trace.displayName || trace.accountEmail || trace.userId} · account {trace.accountStatus || 'unknown'}</span><span>Script {trace.scriptId || '—'} · page {Number(trace.page ?? 0) + 1}/{trace.totalPages ?? '—'}</span><small>Session {trace.sessionId || '—'} · device {trace.deviceHash ? String(trace.deviceHash).slice(0, 12) + '…' : 'not recorded'} · environment {trace.environmentHash ? String(trace.environmentHash).slice(0, 12) + '…' : 'not recorded'} · {trace.createdAt ? new Date(trace.createdAt).toLocaleString('en-GB') : 'time unavailable'}</small></article>)}</div>}
    </div>

    <div className="security-review-toolbar">
      <div role="group" aria-label="Security alert filter"><button className={scope === 'open' ? 'active' : ''} onClick={() => setScope('open')}>Open <span>{alerts.filter((item) => item.status === 'open').length}</span></button><button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>All <span>{alerts.length}</span></button></div>
    </div>

    <div className="security-review-layout">
      <aside className="security-alert-browser">
        {!visibleAlerts.length ? <div className="people-empty"><ShieldCheck size={18}/><strong>No {scope === 'open' ? 'open ' : ''}security alerts</strong><span>Protected-reader signals remain evidence, not accusations.</span></div> : visibleAlerts.map((alert) => <button key={alert.id} className={String(alert.id) === selectedId ? 'security-alert-picker active' : 'security-alert-picker'} onClick={() => setSelectedId(String(alert.id))}>
          <span className={'security-severity ' + String(alert.severity ?? 'high')}>{String(alert.severity ?? 'high').toUpperCase()}</span>
          <span><strong>{alert.subjectDisplayName || alert.subjectEmail || 'Nightjar account'}</strong><small>{alert.reason || 'Protected-content activity requires review.'}</small></span>
          <em>{Number(alert.riskScore ?? 0)}</em>
        </button>)}
      </aside>

      <article className="security-alert-detail">
        {selected ? <>
          <div className="security-alert-detail-head"><div><span className={'security-severity ' + String(selected.severity ?? 'high')}>{String(selected.severity ?? 'high').toUpperCase()} · RISK {Number(selected.riskScore ?? 0)}</span><h3>{selected.subjectDisplayName || selected.subjectEmail || selected.userId}</h3><p>{selected.reason || 'Protected-content activity requires review.'}</p></div><span className="status-pill">{selected.status ?? 'open'}</span></div>

          <div className="security-evidence-grid">
            <div><span>Page views near alert</span><strong>{summary.pageViews ?? 0}</strong></div>
            <div><span>Blocked interactions</span><strong>{summary.blockedInteractions ?? 0}</strong></div>
            <div><span>Explicit exports</span><strong>{summary.exports ?? 0}</strong></div>
            <div><span>Scripts involved</span><strong>{summary.distinctScripts ?? 0}</strong></div>
          </div>

          <div className="security-account-context">
            <div><span>Account</span><strong>{selected.subjectAccountStatus || 'unknown'}{selected.subjectRemoved ? ' · removed' : ''}</strong></div>
            <div><span>Device token</span><strong>{selected.deviceHash ? String(selected.deviceHash).slice(0, 16) + '…' : 'Not recorded'}</strong></div>
            <div><span>Device blocked</span><strong>{selected.deviceBlocked ? 'Yes' : 'No'}</strong></div>
            <div><span>Environment signature</span><strong>{selected.environmentHash ? String(selected.environmentHash).slice(0, 16) + '…' : 'Not recorded'}</strong></div>
            <div><span>Environment blocked</span><strong>{selected.environmentBlocked ? 'Yes' : 'No'}</strong></div>
            <div><span>Other accounts on exact token</span><strong>{linkedOthers.length}</strong></div>
            <div><span>Other accounts on environment</span><strong>{linkedEnvironmentOthers.length}</strong></div>
          </div>

          {linkedOthers.length > 0 && <div className="security-linked-accounts"><strong>Linked accounts on the same device token</strong>{linkedOthers.map((item: any) => <div key={item.userId}><span>{item.userId}</span><em>{item.status || 'unknown'}{item.removed ? ' · removed' : ''}</em></div>)}<small>Device correlation is supporting evidence only. Shared devices are possible.</small></div>}
          {linkedEnvironmentOthers.length > 0 && <div className="security-linked-accounts security-environment-links"><strong>Accounts sharing the browser/device environment</strong>{linkedEnvironmentOthers.map((item: any) => <div key={item.userId}><span>{item.userId}</span><em>{item.status || 'unknown'}{item.removed ? ' · removed' : ''}</em></div>)}<small>This is weaker correlation than an exact Nightjar device token. Similar or shared devices can match; treat it as supporting evidence, not proof.</small></div>}

          <div className="security-event-timeline">
            <div className="security-section-title"><History size={14}/><strong>Recent evidence</strong></div>
            {(selected.recentEvents ?? []).length ? (selected.recentEvents ?? []).map((event: any) => <div className="security-event-row" key={event.id ?? event.eventType + ':' + event.createdAt}>
              <span><strong>{String(event.eventType ?? 'event').replace(/_/g, ' ')}</strong><small>{event.relatedId || 'No related script'}</small></span>
              {event.forensicToken ? <button className="security-token-button" onClick={() => void trace(String(event.forensicToken))}>FP {event.forensicToken} <ExternalLink size={11}/></button> : <span/>}
              <time>{event.createdAt ? new Date(event.createdAt).toLocaleString('en-GB') : '—'}</time>
            </div>) : <p className="panel-note">No nearby security events were recorded around this alert.</p>}
          </div>

          {(selected.caseHistory ?? []).length > 0 && <div className="security-case-history"><div className="security-section-title"><History size={14}/><strong>Case history</strong></div>{(selected.caseHistory ?? []).map((item: any, index: number) => <div key={index}><span>{String(item.state ?? 'review').replace(/_/g, ' ')}</span><p>{item.note || 'No note.'}</p><small>{item.at ? new Date(item.at).toLocaleString('en-GB') : '—'}</small></div>)}</div>}

          <div className="security-network-note"><ShieldAlert size={14}/><span>{selected.networkCorrelationNote || 'Nightjar uses pseudonymous device and forensic correlation. A client-supplied IP value is not trusted as security evidence.'}</span></div>

          <div className="security-alert-actions">
            <button disabled={busyId === String(selected.id)} onClick={() => void act(selected, 'benign')}><Check size={13}/> Benign</button>
            <button disabled={busyId === String(selected.id)} onClick={() => void act(selected, 'revoke_sessions')}><LockKeyhole size={13}/> Revoke reader</button>
            {selected.subjectAccountStatus === 'suspended' ? <button disabled={busyId === String(selected.id)} onClick={() => void act(selected, 'restore_account')}><RotateCcw size={13}/> Restore</button> : <button disabled={busyId === String(selected.id)} onClick={() => void act(selected, 'freeze_account')}><ShieldAlert size={13}/> Freeze</button>}
            {selected.deviceHash && <button disabled={busyId === String(selected.id)} onClick={() => void act(selected, 'block_device')}><Ban size={13}/> Block device</button>}
            {selected.environmentHash && <button disabled={busyId === String(selected.id)} onClick={() => void act(selected, 'block_environment')}><Fingerprint size={13}/> Block environment</button>}
            <button className="security-remove-action" disabled={busyId === String(selected.id) || selected.subjectRemoved === true} onClick={() => void act(selected, 'remove_account')}><UserX size={13}/> Remove account</button>
          </div>
        </> : <div className="people-empty"><ShieldAlert size={18}/><strong>Select an alert</strong><span>Review the supporting evidence before taking account-level action.</span></div>}
      </article>
    </div>
  </section>;
}
