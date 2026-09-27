import { useEffect, useMemo, useState } from 'react';
import { api } from '@appdeploy/client';
import { Ban, Check, ExternalLink, Fingerprint, History, LockKeyhole, RefreshCw, Search, ShieldAlert, ShieldCheck, UserX, X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  notify: (message: string) => void;
};

type SecurityAction = 'benign' | 'revoke_sessions' | 'freeze_account' | 'restore_account' | 'remove_account' | 'block_device';

const actionLabel: Record<SecurityAction, string> = {
  benign: 'Mark benign',
  revoke_sessions: 'Revoke reader sessions',
  freeze_account: 'Freeze account',
  restore_account: 'Restore account',
  remove_account: 'Remove account',
  block_device: 'Block device token',
};

export default function SecurityReview({ open, onClose, notify }: Props) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<SecurityAction | null>(null);
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

  useEffect(() => {
    if (!open) return;
    void load();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const visibleAlerts = useMemo(
    () => scope === 'all' ? alerts : alerts.filter((alert) => alert.status === 'open'),
    [alerts, scope],
  );
  const selected = alerts.find((alert) => String(alert.id) === selectedId) ?? null;

  const runAction = async (action: SecurityAction) => {
    if (!selected?.id || busyAction) return;
    const destructive = ['freeze_account', 'remove_account', 'block_device'].includes(action);
    const promptText = destructive
      ? 'Add the review reason for this action. This note is required and will be kept in the case history.'
      : action === 'benign'
        ? 'Optional review note: why is this alert considered harmless?'
        : 'Optional administrator note for this security action.';
    const note = window.prompt(promptText) ?? '';
    if (destructive && !note.trim()) {
      notify('A review note is required before a destructive security action.');
      return;
    }
    setBusyAction(action);
    try {
      await api.post('/api/admin/security-alerts/' + encodeURIComponent(String(selected.id)) + '/action', { action, note });
      await load();
      notify(actionLabel[action] + ' recorded.');
    } catch {
      notify('Security action could not be completed.');
    } finally {
      setBusyAction(null);
    }
  };

  const trace = async (token = traceToken) => {
    const clean = token.trim().toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 32);
    if (clean.length < 8) {
      notify('Enter at least eight characters from the forensic FP token.');
      return;
    }
    setTraceToken(clean);
    setTraceLoading(true);
    try {
      const { data } = await api.get('/api/admin/security/trace/' + encodeURIComponent(clean));
      setTraces(data?.traces ?? []);
      if (!(data?.traces ?? []).length) notify('No protected-reader event matched that forensic token.');
    } catch {
      setTraces([]);
      notify('Forensic token lookup could not be completed.');
    } finally {
      setTraceLoading(false);
    }
  };

  if (!open) return null;

  const summary = selected?.evidenceSummary ?? {};
  const linkedOthers = (selected?.linkedAccounts ?? []).filter((item: any) => item.sameAsSubject !== true);

  return <div className="admin-panel-modal security-review-backdrop" role="dialog" aria-modal="true" aria-labelledby="security-review-title">
    <section className="security-review-modal">
      <div className="admin-modal-head">
        <div>
          <span className="mini-label">ADMINISTRATION / SECURITY</span>
          <h2 id="security-review-title">Protected-content security review</h2>
          <p>Signals support human review. Nightjar does not automatically freeze an account because of a screenshot, shared device, or single suspicious event.</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close security review"><X size={18}/></button>
      </div>

      <div className="security-review-principle">
        <ShieldCheck size={17}/>
        <div><strong>REVIEW FIRST</strong><span>Automatic protection may revoke an unusually fast reader session, but whole-account freeze, removal and device blocking require an administrator decision.</span></div>
      </div>

      <section className="security-trace-panel">
        <div><Fingerprint size={17}/><span><strong>Trace a leaked screenshot</strong><small>Use the visible “FORENSIC FP” token from a screenshot to identify the authorised account, script, session and page.</small></span></div>
        <form onSubmit={(event) => { event.preventDefault(); void trace(); }}>
          <input value={traceToken} onChange={(event) => setTraceToken(event.target.value.toUpperCase())} placeholder="e.g. A1B2C3D4…" aria-label="Forensic screenshot token"/>
          <button className="secondary-button with-icon" disabled={traceLoading} type="submit"><Search size={14}/>{traceLoading ? 'Tracing…' : 'Trace token'}</button>
        </form>
        {traces.length > 0 && <div className="security-trace-results">{traces.map((item, index) => <article key={String(item.forensicToken) + ':' + index}>
          <div><strong>{item.displayName || item.accountEmail || item.userId || 'Nightjar account'}</strong><span>{item.accountStatus || 'unknown status'}</span></div>
          <p>Script {item.scriptId || '—'} · Page {Number(item.page ?? 0) + 1}/{item.totalPages ?? '—'} · Session {item.sessionId || '—'}</p>
          <small>FP {item.forensicToken} · Device {item.deviceHash ? String(item.deviceHash).slice(0, 12) + '…' : 'not recorded'} · {item.createdAt ? new Date(item.createdAt).toLocaleString('en-GB') : 'time unavailable'}</small>
        </article>)}</div>}
      </section>

      <div className="security-review-toolbar">
        <div role="group" aria-label="Security alert filter">
          <button className={scope === 'open' ? 'active' : ''} onClick={() => setScope('open')}>Open alerts <span>{alerts.filter((item) => item.status === 'open').length}</span></button>
          <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>All alerts <span>{alerts.length}</span></button>
        </div>
        <button className="ghost-button with-icon" onClick={() => void load()} disabled={loading}><RefreshCw size={13}/>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      <div className="security-review-layout">
        <aside className="security-alert-list">
          {visibleAlerts.length ? visibleAlerts.map((alert) => <button key={alert.id} className={String(alert.id) === selectedId ? 'security-alert-row active' : 'security-alert-row'} onClick={() => setSelectedId(String(alert.id))}>
            <span className={'security-severity ' + String(alert.severity ?? 'high')}>{String(alert.severity ?? 'high').toUpperCase()}</span>
            <span><strong>{alert.subjectDisplayName || alert.subjectEmail || 'Nightjar account'}</strong><small>{alert.reason || 'Protected-content activity requires review.'}</small></span>
            <em>{Number(alert.riskScore ?? 0)}</em>
          </button>) : <div className="people-empty"><ShieldCheck size={18}/><strong>No {scope === 'open' ? 'open ' : ''}security alerts.</strong><span>New protected-content signals will appear here for administrator review.</span></div>}
        </aside>

        <article className="security-alert-detail">
          {selected ? <>
            <div className="security-alert-detail-head">
              <div><span className={'security-severity ' + String(selected.severity ?? 'high')}>{String(selected.severity ?? 'high').toUpperCase()} · RISK {Number(selected.riskScore ?? 0)}</span><h3>{selected.subjectDisplayName || selected.subjectEmail || selected.userId}</h3><p>{selected.reason}</p></div>
              <span className="status-pill">{selected.status}</span>
            </div>

            <div className="security-evidence-grid">
              <div><span>Page views near alert</span><strong>{summary.pageViews ?? 0}</strong></div>
              <div><span>Blocked interactions</span><strong>{summary.blockedInteractions ?? 0}</strong></div>
              <div><span>Explicit exports</span><strong>{summary.exports ?? 0}</strong></div>
              <div><span>Scripts involved</span><strong>{summary.distinctScripts ?? 0}</strong></div>
            </div>

            <div className="security-account-context">
              <div><span>Account</span><strong>{selected.subjectAccountStatus || 'unknown'}{selected.subjectRemoved ? ' · removed' : ''}</strong></div>
              <div><span>Device correlation</span><strong>{selected.deviceHash ? String(selected.deviceHash).slice(0, 16) + '…' : 'No device token'}</strong></div>
              <div><span>Device blocked</span><strong>{selected.deviceBlocked ? 'Yes' : 'No'}</strong></div>
              <div><span>Other accounts on token</span><strong>{linkedOthers.length}</strong></div>
            </div>

            {linkedOthers.length > 0 && <section className="security-linked-accounts"><h4>Linked accounts on the same device token</h4>{linkedOthers.map((item: any) => <div key={item.userId}><span>{item.userId}</span><strong>{item.status || 'unknown'}{item.removed ? ' · removed' : ''}</strong></div>)}<p>Device correlation is supporting evidence only; shared devices are possible.</p></section>}

            <section className="security-event-timeline">
              <div className="security-section-title"><History size={14}/><strong>Recent evidence</strong></div>
              {(selected.recentEvents ?? []).length ? (selected.recentEvents ?? []).map((event: any) => <div className="security-event-row" key={event.id ?? event.eventType + ':' + event.createdAt}>
                <span><strong>{String(event.eventType ?? 'event').replace(/_/g, ' ')}</strong><small>{event.relatedId || 'No related script'}</small></span>
                {event.forensicToken ? <button className="security-token-button" onClick={() => void trace(String(event.forensicToken))}>FP {event.forensicToken} <ExternalLink size={11}/></button> : <span/>}
                <time>{event.createdAt ? new Date(event.createdAt).toLocaleString('en-GB') : '—'}</time>
              </div>) : <p className="panel-note">No nearby security events were recorded around this alert.</p>}
            </section>

            {(selected.caseHistory ?? []).length > 0 && <section className="security-case-history">
              <div className="security-section-title"><History size={14}/><strong>Case history</strong></div>
              {(selected.caseHistory ?? []).map((item: any, index: number) => <div key={index}><span>{String(item.state ?? 'review').replace(/_/g, ' ')}</span><p>{item.note || 'No note.'}</p><small>{item.at ? new Date(item.at).toLocaleString('en-GB') : '—'}</small></div>)}
            </section>}

            <div className="security-network-note"><ShieldAlert size={14}/><span>{selected.networkCorrelationNote || 'Network correlation is unavailable in the current runtime; Nightjar does not trust client-supplied IP values.'}</span></div>

            <div className="security-actions">
              <button className="secondary-button with-icon" disabled={Boolean(busyAction)} onClick={() => void runAction('benign')}><Check size={13}/> Mark benign</button>
              <button className="secondary-button with-icon" disabled={Boolean(busyAction)} onClick={() => void runAction('revoke_sessions')}><LockKeyhole size={13}/> Revoke sessions</button>
              {selected.subjectAccountStatus === 'suspended' ? <button className="secondary-button with-icon" disabled={Boolean(busyAction)} onClick={() => void runAction('restore_account')}><RefreshCw size={13}/> Restore account</button> : <button className="danger-button" disabled={Boolean(busyAction)} onClick={() => void runAction('freeze_account')}><ShieldAlert size={13}/> Freeze account</button>}
              <button className="danger-button" disabled={Boolean(busyAction) || !selected.deviceHash} onClick={() => void runAction('block_device')}><Ban size={13}/> Block device token</button>
              <button className="danger-button" disabled={Boolean(busyAction) || selected.subjectRemoved === true} onClick={() => void runAction('remove_account')}><UserX size={13}/> Remove account</button>
            </div>
          </> : <div className="people-empty"><ShieldAlert size={19}/><strong>Select a security alert.</strong><span>Review all supporting evidence before taking account-level action.</span></div>}
        </article>
      </div>
    </section>
  </div>;
}
