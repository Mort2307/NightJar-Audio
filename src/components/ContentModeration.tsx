import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { Check, Eye, FileAudio, History, MessageSquare, X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  notify: (message: string) => void;
};

export default function ContentModeration({ open, onClose, notify }: Props) {
  const [queue, setQueue] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [reasonCode, setReasonCode] = useState('content_policy');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/release-queue');
      setQueue(data?.releases ?? []);
    } catch { notify('Release moderation queue could not be loaded.'); }
    finally { setLoading(false); }
  };

  const loadHistory = async (releaseId: string) => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get('/api/admin/releases/' + encodeURIComponent(releaseId) + '/moderation-history');
      setHistory(data?.history ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => { if (open) void load(); }, [open]);
  useEffect(() => {
    if (!selected?.id) {
      setHistory([]);
      return;
    }
    setReasonCode('content_policy');
    void loadHistory(String(selected.id));
  }, [selected?.id]);

  const decide = async (decision: 'approved' | 'changes' | 'rejected') => {
    if (!selected?.id) return;
    const note = decision === 'changes' ? (window.prompt('What should the creator change?') ?? '') : (window.prompt('Moderator note (optional)') ?? '');
    try {
      await api.post('/api/admin/releases/' + selected.id + '/moderate', {
        decision,
        note,
        reasonCode: decision === 'approved' ? 'approved' : reasonCode,
      });
      await load();
      await loadHistory(String(selected.id));
      setSelected(null);
      notify(decision === 'approved' ? 'Release approved and published.' : decision === 'changes' ? 'Changes requested from the creator.' : 'Release rejected.');
    } catch { notify('Moderation decision could not be saved.'); }
  };

  if (!open) return null;
  return <div className="admin-panel-modal" role="dialog" aria-modal="true">
    <section className="moderation-modal">
      <div className="admin-modal-head"><div><span className="mini-label">ADMINISTRATION / CONTENT</span><h2>Release moderation</h2><p>Preview the actual submission before it reaches the public adult catalogue. Every decision is retained in the moderation audit trail.</p></div><button className="icon-button" onClick={onClose} aria-label="Close moderation"><X size={18} /></button></div>
      <div className="moderation-layout">
        <aside className="moderation-queue">{loading ? <div className="people-empty">Loading moderation queue…</div> : queue.length ? queue.map((release) => <button key={release.id} className={selected?.id === release.id ? 'moderation-item active' : 'moderation-item'} onClick={() => setSelected(release)}><FileAudio size={16} /><span><strong>{release.title}</strong><small>{release.creatorName || 'Creator'} · {release.category || 'Audio'}</small></span></button>) : <div className="people-empty"><Check size={18} /><strong>Queue is clear.</strong><span>New creator submissions will appear here.</span></div>}</aside>
        <article className="moderation-preview">{selected ? <>
          <div className="moderation-preview-head"><div><span className="mini-label">{selected.category || 'AUDIO'}</span><h3>{selected.title}</h3><p>By {selected.creatorName || 'Nightjar creator'} · {selected.creatorHandle ? '@' + selected.creatorHandle.replace(/^@/, '') : 'handle not set'}</p></div>{selected.audioUrl && <audio className="moderation-audio" controls src={selected.audioUrl} />}</div>
          <div className="moderation-copy"><p>{selected.description || 'No description.'}</p><div className="moderation-tags">{[...(selected.tags || []), ...(selected.tropes || [])].map((tag:string) => <span key={tag}>{tag}</span>)}</div></div>
          <label className="moderation-reason">Decision reason<select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}><option value="content_policy">Content policy</option><option value="metadata">Metadata / labelling</option><option value="audio_quality">Audio quality</option><option value="rights">Rights / provenance</option><option value="other">Other</option></select></label>
          <div className="moderation-actions"><button className="secondary-button" onClick={() => void decide('changes')}><MessageSquare size={14} /> Request changes</button><button className="ghost-button" onClick={() => void decide('rejected')}><X size={14} /> Reject</button><button className="primary-button" onClick={() => void decide('approved')}><Check size={14} /> Approve & publish</button></div>
          <section className="moderation-history" aria-label="Moderation history">
            <div className="moderation-history-head"><span><History size={14}/> Audit trail</span><small>{historyLoading ? 'Loading…' : history.length + ' decision' + (history.length === 1 ? '' : 's')}</small></div>
            {history.length ? history.map((item) => <div className="moderation-history-row" key={item.id ?? item.createdAt}><div><strong>{String(item.decision ?? 'decision').replace(/_/g, ' ')}</strong><span>{String(item.reasonCode ?? 'other').replace(/_/g, ' ')}</span></div><p>{item.note || 'No moderator note.'}</p><small>{item.createdAt ? new Date(item.createdAt).toLocaleString('en-GB') : 'Recorded decision'}</small></div>) : <div className="moderation-history-empty">No previous moderation decisions for this release.</div>}
          </section>
        </> : <div className="people-empty"><Eye size={19} /><strong>Select a release.</strong><span>Moderation shows the actual audio and metadata together.</span></div>}</article>
      </div>
    </section>
  </div>;
}
