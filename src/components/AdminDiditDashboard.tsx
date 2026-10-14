import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, ClipboardCopy, RefreshCw, ShieldCheck } from 'lucide-react';
import { nightjarAge, type DiditAdminDashboard as Snapshot } from '../platform/firebase-age';

// Nightjar does not fetch or expose identity documents, dates of birth or
// biometrics here. Didit Business Console remains the evidence-review source.
export default function AdminDiditDashboard() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await nightjarAge.adminDashboard());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load the private Didit report.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const copySession = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(value); }
    catch { setCopied(''); }
  };
  const consoleUrl = data?.providerConsole === 'https://business.didit.me/'
    ? data.providerConsole : 'https://business.didit.me/';

  return <section className="panel nj-didit-owner-dashboard" aria-label="Administrator age assurance review">
    <div className="professional-role-head">
      <div>
        <span className="mini-label">ADMIN ONLY · TRUST & SAFETY</span>
        <h2>Didit verification desk</h2>
        <p>Review Nightjar's stored verification outcomes and open Didit's protected Business Console when evidence or a manual decision needs attention.</p>
      </div>
      <ShieldCheck size={23} aria-hidden="true"/>
    </div>
    <div className="admin-member-multi-role-actions">
      <a className="primary-button" href={consoleUrl} target="_blank" rel="noopener noreferrer">
        Open Didit Business Console <ArrowUpRight size={15}/>
      </a>
      <button type="button" className="secondary-button" onClick={() => void reload()} disabled={loading}>
        <RefreshCw size={15}/> {loading ? 'Loading…' : 'Refresh Nightjar records'}
      </button>
    </div>
    <p className="access-fine">The figures below come from Nightjar's signed-webhook records, not a live API search of Didit's full evidence. Didit's own console is the source for ID checks, reports, review outcomes and retention controls.</p>
    {error && <p role="alert" className="access-note">{error}</p>}
    {data && <>
      <div className="admin-legal-readiness-summary">
        <span className="status-pill">Records {data.counts.total}{data.truncated ? '+' : ''}</span>
        <span className="status-pill"><CheckCircle2 size={14}/> Approved {data.counts.approved}</span>
        <span className="status-pill">In progress {data.counts.pending}</span>
        <span className="status-pill warning"><AlertTriangle size={14}/> Needs review {data.counts.review}</span>
        <span className="status-pill">Failed / expired {data.counts.failed}</span>
      </div>
      <p className="access-fine">These counts cover up to 500 account records, not an unlimited full-ledger export. Only 25 recent outcomes are shown here. No verification result is editable from this dashboard.</p>
      <div className="legal-beta-warning compact"><ShieldCheck size={15}/><div>
        <strong>Didit live-app privacy configuration: owner action required</strong>
        <span>The proposed exact 90-day evidence-retention window is NOT confirmed. Open Didit → select the Nightjar LIVE application → App Settings → Data retention → choose 90 days where supported → save and verify. If only “3 months” is offered, confirm the exact day-count with Didit before representing it as 90 days.</span>
        <span>Separately, Didit says model training is enabled by default. To prevent this additional use, open Settings → Account → Privacy and data use, turn OFF “Allow Didit to use my organization's verification data to improve models” and confirm “Opted out”.</span>
        <span>Check that any optional retained biometric templates are disabled, or have a finite expiry consistent with the documented policy. Provider API audit logs may have separate retention periods. Keep evidence of these checks with Nightjar’s compliance records; changing a local badge alone cannot configure Didit.</span>
        <a href="https://help.didit.me/data-privacy/delete-verification-data" target="_blank" rel="noopener noreferrer">Didit retention guidance <ArrowUpRight size={13}/></a>
      </div></div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',minWidth:640,textAlign:'left',borderCollapse:'separate',borderSpacing:'0 10px'}}>
          <thead><tr><th scope="col">Account</th><th scope="col">Result</th><th scope="col">Last updated</th><th scope="col">Session for Didit review</th></tr></thead>
          <tbody>
            {data.recent.map((record, index) => <tr key={record.sessionId ?? record.account + index}>
              <td>{record.account}</td>
              <td>{record.verified ? 'Approved 18+' : record.reverifyRequired ? 'Review required' : record.status.replaceAll('_',' ')}<small style={{display:'block'}}>{record.environment}</small></td>
              <td>{record.updatedAt ? new Date(record.updatedAt).toLocaleDateString('en-GB') : 'Not recorded'}</td>
              <td>{record.sessionId
                ? <button className="secondary-button" type="button" title="Copy session reference to locate this check in Didit" onClick={() => void copySession(record.sessionId!)}>
                    <ClipboardCopy size={14}/>{copied === record.sessionId ? 'Copied' : 'Copy session ID'}
                  </button>
                : <span>Not started</span>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {data.recent.length === 0 && <p>No Didit sessions have been recorded yet.</p>}
    </>}
  </section>;
}
