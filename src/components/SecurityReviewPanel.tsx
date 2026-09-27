import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { Ban, Check, Fingerprint, LockKeyhole, RefreshCw, RotateCcw, Search, ShieldAlert, ShieldCheck, UserX } from 'lucide-react';

type Props = {
  notify: (message: string) => void;
  onAccountStateChange?: () => void | Promise<void>;
};

type SecurityAction = 'benign' | 'revoke_sessions' | 'freeze_account' | 'restore_account' | 'remove_account' | 'block_device';

export default function SecurityReviewPanel({ notify, onAccountStateChange }: Props) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [traceToken, setTraceToken] = useState('');
  const [traces, setTraces] = useState<any[]>([]);
  const [traceLoading, setTraceLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/security-alerts');
      setAlerts(data?.alerts ?? []);
    } catch {
      notify('Security alerts could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const act = async (alert: any, action: SecurityAction) => {
    if (!alert?.id || busyId) return;
    const destructive = action === 'freeze_account' || action === 'remove_account' || action === 'block_device';
    if (destructive && !window.confirm(action === 'remove_account'
      ? 'Remove this account from Nightjar, revoke protected-reader access and hide its public profile? Security evidence will be retained.'
      : action === 'freeze_account'
        ? 'Freeze this account and revoke all active protected-reader sessions?'
        : 'Block this pseudonymous device token from opening protected scripts?')) return;

    const note = action === 'benign'
      ? (window.prompt('Optional review note explaining why this alert is benign') ?? '')
      : destructive
        ? (window.prompt('Administrator reason for this protective action') ?? '')
        : '';
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
                : 'Account removed from Nightjar while security evidence was retained.');
    } catch {
      notify('The security action could not be completed.');
    } finally {
      setBusyId(null);
    }
  };

  const trace = async () => {
    const token = traceToken.trim().replace(/^.*?FP\s*/i, '').replace(/[^a-f0-9]/gi, '').toUpperCase();
    if (token.length < 8) {
      notify('Enter at least eight characters from the FP forensic token visible in the screenshot.');
      return;
    }
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

  return <section className="security-review-panel">
    <div className="security-review-head">
      <div><span className="mini-label">SECURITY / ADMIN REVIEW</span><h2>Protected-content alerts</h2><p>Signals create evidence for human review. Nightjar does not automatically freeze accounts from ordinary screenshot-like or browser behaviour.</p></div>
      <button className="secondary-button with-icon" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/>{loading ? 'Refreshing…' : 'Refresh alerts'}</button>
    </div>

    <div className="security-trace-card">
      <div><Fingerprint size={18}/><span><strong>Trace a leaked screenshot</strong><small>Enter the FP token visible in a protected-page watermark. The lookup returns the exact session and page without exposing a private identifier in the screenshot itself.</small></span></div>
      <div className="security-trace-form"><input value={traceToken} onChange={(event) => setTraceToken(event.target.value)} placeholder="e.g. 2A91F84C…" aria-label="Forensic screenshot token"/><button className="secondary-button with-icon" onClick={() => void trace()} disabled={traceLoading}><Search size={13}/>{traceLoading ? 'Tracing…' : 'Trace'}</button></div>
      {!!traces.length && <div className="security-trace-results">{traces.map((trace) => <article key={String(trace.forensicToken) + String(trace.sessionId)}><strong>FP {trace.forensicToken}</strong><span>{trace.displayName || trace.userId} · account {trace.accountStatus || 'unknown'}</span><span>Script {trace.scriptId || '—'} · page {Number(trace.page ?? 0) + 1}/{trace.totalPages ?? '—'}</span><small>Session {trace.sessionId || '—'} · {trace.createdAt ? new Date(trace.createdAt).toLocaleString('en-GB') : 'time unavailable'}</small></article>)}</div>}
    </div>

    <div className="security-alert-list">
      {!alerts.length ? <div className="people-empty"><ShieldCheck size={18}/><strong>No security alerts</strong><span>Protected-reader signals remain evidence, not accusations.</span></div> : alerts.map((alert) => {
        const busy = busyId === String(alert.id);
        const restricted = alert.subjectAccountStatus === 'suspended' || alert.subjectRemoved === true;
        return <article className="security-alert-review" key={alert.id}>
          <div className="security-alert-main">
            <span className={'security-severity ' + String(alert.severity ?? 'high')}>{String(alert.severity ?? 'high').toUpperCase()}</span>
            <div><strong>{alert.reason ?? 'Suspicious protected-content activity'}</strong><span>Account {alert.userId} · {alert.subjectRemoved ? 'removed' : alert.subjectAccountStatus ?? 'status unknown'} · script {alert.relatedId ?? '—'} · {alert.createdAt ? new Date(alert.createdAt).toLocaleString('en-GB') : 'time unavailable'}</span><small>{alert.deviceHash ? 'Pseudonymous device correlation available' : 'No device correlation supplied'} · status {alert.status ?? 'open'}</small></div>
          </div>
          <div className="security-alert-actions">
            <button disabled={busy} onClick={() => void act(alert, 'benign')}><Check size={13}/> Benign</button>
            <button disabled={busy} onClick={() => void act(alert, 'revoke_sessions')}><LockKeyhole size={13}/> Revoke reader</button>
            {restricted ? <button disabled={busy} onClick={() => void act(alert, 'restore_account')}><RotateCcw size={13}/> Restore</button> : <button disabled={busy} onClick={() => void act(alert, 'freeze_account')}><ShieldAlert size={13}/> Freeze</button>}
            {alert.deviceHash && <button disabled={busy} onClick={() => void act(alert, 'block_device')}><Ban size={13}/> Block device</button>}
            <button className="security-remove-action" disabled={busy} onClick={() => void act(alert, 'remove_account')}><UserX size={13}/> Remove account</button>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
