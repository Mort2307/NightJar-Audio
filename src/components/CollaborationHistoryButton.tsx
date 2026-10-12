import { useEffect, useState } from 'react';
import { Handshake, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { nightjarCollaboration, type VerifiedCollaborationHistory } from '../platform/firebase-collaboration';
import './collaboration-history.css';

type Props = {
  userId: string;
  count: number;
  displayName?: string;
  demoMode?: boolean;
  compact?: boolean;
};

export default function CollaborationHistoryButton({ userId, count, displayName = 'this creator', demoMode = false, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<VerifiedCollaborationHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const refresh = async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      if (demoMode) {
        setData({ userId, count, workflowOnlyCount: count, published: [] });
      } else {
        setData(await nightjarCollaboration.history(userId));
      }
    } catch {
      setError('Collaboration history could not be loaded. Please retry.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, userId, demoMode]);

  const close = () => setOpen(false);
  return <>
    <button type="button"
      className={compact ? 'nj-handshake-button compact collaborator-directory-reputation' : 'nj-handshake-button'}
      onClick={(event) => { event.stopPropagation(); setOpen(true); }}
      aria-label={'View ' + displayName + ' verified collaborations: ' + count}
      title="Open verified collaborations and public work">
      <Handshake size={compact ? 13 : 15} aria-hidden="true"/>
      {compact ? count : count + ' verified collaboration' + (count === 1 ? '' : 's')}
    </button>
    {open && <div className="nj-handshake-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="nj-handshake-dialog" role="dialog" aria-modal="true" aria-label={displayName + ' collaboration history'}>
        <header className="nj-handshake-header">
          <div><span className="mini-label"><ShieldCheck size={13}/> NIGHTJAR VERIFIED WORK</span><h2>{displayName}'s collaborations</h2><p>Published releases and completed Nightjar workflows, not manually claimed handshake totals.</p></div>
          <button type="button" className="icon-button" onClick={close} aria-label="Close collaboration history"><X size={19}/></button>
        </header>
        <div className="nj-handshake-summary"><Handshake size={19}/><strong>{data?.count ?? count}</strong><span>verified collaboration{(data?.count ?? count) === 1 ? '' : 's'}</span><button type="button" className="ghost-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={13}/> Refresh</button></div>
        {loading && <p role="status">Checking verified Nightjar credits…</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && data && <>
          {data.published.length > 0 ? <div className="nj-handshake-releases">
            <h3>Published work together</h3>
            {data.published.map((release) => <article key={release.releaseId}>
              <div><strong>{release.title}</strong>{release.releaseDate && <small>Released {new Date(release.releaseDate).toLocaleDateString('en-GB')}</small>}</div>
              <p>{release.contributors.map((item) => item.name + ' · ' + item.role).join('  /  ')}</p>
              <span className="nj-handshake-verified"><ShieldCheck size={13}/> Published release verified</span>
            </article>)}
          </div> : <div className="nj-handshake-empty"><ShieldCheck size={18}/><strong>No linked public releases yet.</strong><p>Historical recordings count once they are published with both collaborators' Nightjar account IDs in the release credits.</p></div>}
          {data.workflowOnlyCount > 0 && <p className="nj-handshake-private"><ShieldCheck size={14}/> {data.workflowOnlyCount} further completed collaboration{data.workflowOnlyCount === 1 ? '' : 's'} confirmed through private Nightjar workflows. Confidential proposal details are not public.</p>}
          <p className="nj-handshake-help"><strong>Missing an older collaboration?</strong> Ask the release owner or Nightjar administrators to check that every contributor's existing Nightjar account is linked to the published release credit. Adding a name alone cannot verify another account, and clicking the handshake cannot inflate the total.</p>
        </>}
        <button type="button" className="secondary-button" onClick={close}>Close</button>
      </section>
    </div>}
  </>;
}
