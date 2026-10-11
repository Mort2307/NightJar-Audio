import { AlertCircle, ArrowRight, CheckCircle2, Clock3, LockKeyhole, RefreshCw, ShieldAlert, ShieldCheck, UserCircle2 } from 'lucide-react';

type Props = {
  alerts: any[];
  loading: boolean;
  evidenceLoading: boolean;
  onRefresh: () => void;
  onReview: (alert: any) => void;
  onBenign: (alert: any) => void;
  onRevoke: (alert: any) => void;
  onSuspend: (alert: any) => void;
};

function AlertCase({ alert, evidenceLoading, onReview, onBenign, onRevoke, onSuspend }: Omit<Props,'alerts'|'loading'|'onRefresh'> & { alert:any }) {
  const auth = alert.category === 'authentication';
  const open = alert.status === 'open';
  const count = Number(alert.signal?.failedAttempts15m ?? 0);
  return <article className="nj-security-case">
    <div className="nj-security-case-meta">
      <span className="nj-security-case-priority"><AlertCircle size={14}/>{String(alert.severity ?? 'medium').toUpperCase()} · risk {alert.riskScore ?? '—'}</span>
      <span className={open ? 'nj-security-case-status open' : 'nj-security-case-status'}>{open ? 'Needs review' : 'Reviewed'}</span>
    </div>
    <h3>{auth ? 'Repeated sign-in attempts' : 'Protected-content activity'}</h3>
    <p className="nj-security-case-who"><UserCircle2 size={16}/>{auth ? 'Account targeted: ' + (alert.targetEmailMasked ?? 'unidentified') : 'Account: ' + (alert.userName ?? 'Nightjar account') + (alert.userHandle ? ' · @' + alert.userHandle : '')}</p>
    <p>{auth
      ? count > 0
        ? `${count} unsuccessful or blocked sign-ins within 15 minutes (at the time the alert was created).`
        : alert.reason ?? 'Unsuccessful authentication attempts need review.'
      : alert.reason ?? 'A protection signal requires contextual review.'}</p>
    {auth && <p className="nj-security-case-note"><LockKeyhole size={14}/> Targeted account is not necessarily the person who attempted to sign in.</p>}
    <p className="nj-security-case-time"><Clock3 size={14}/>{alert.createdAt ? new Date(alert.createdAt).toLocaleString('en-GB') : 'Time unavailable'}</p>
    <div className="nj-security-case-actions">
      <button type="button" className="primary-button" disabled={evidenceLoading} onClick={() => onReview(alert)}>
        {auth ? 'Who & why? Review' : 'Review evidence'} <ArrowRight size={15}/>
      </button>
      {open && <button type="button" className="secondary-button" onClick={() => onBenign(alert)}>Mark harmless</button>}
    </div>
    {!auth && open && <details className="nj-security-interventions"><summary>Additional safety actions</summary>
      <p>Only use these actions after confirming the supporting evidence. Browser signals alone do not establish malicious intent.</p>
      <div><button type="button" className="secondary-button" onClick={() => onRevoke(alert)}>Revoke reader sessions</button><button type="button" className="danger-button" onClick={() => onSuspend(alert)}>Suspend account</button></div>
    </details>}
  </article>;
}

export default function AdminSecurityAlerts({alerts, loading, evidenceLoading, onRefresh, onReview, onBenign, onRevoke, onSuspend}:Props) {
  const active = alerts.filter(alert => alert.status === 'open');
  const history = alerts.filter(alert => alert.status !== 'open');
  const actions = { evidenceLoading, onReview, onBenign, onRevoke, onSuspend };

  return <section id="admin-security-alerts" className="security-alert-panel nj-security-console">
    <div className="nj-security-console-head">
      <div><span className="mini-label">SAFETY / OWNER ALERTS</span><h2>Security alerts</h2><p>Find out whose account was affected, what triggered the alert and whether someone needs help. Nothing is treated as proof of wrongdoing without review.</p></div>
      <button className="secondary-button" type="button" onClick={onRefresh} disabled={loading}><RefreshCw size={15}/>{loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    <div className="nj-security-active-label"><ShieldAlert size={16}/><strong>{active.length} requiring review</strong></div>
    {active.length ? <div className="security-alert-list">{active.map(alert => <AlertCase key={alert.id} alert={alert} {...actions}/>)}</div> :
      <div className="people-empty"><ShieldCheck size={18}/><strong>No security alerts need review.</strong><span>Reviewed events are kept in the history below.</span></div>}
    {history.length > 0 && <details className="nj-security-history">
      <summary><CheckCircle2 size={16}/> Reviewed history ({history.length})</summary>
      <div className="security-alert-list">{history.map(alert => <AlertCase key={alert.id} alert={alert} {...actions}/>)}</div>
    </details>}
  </section>;
}
