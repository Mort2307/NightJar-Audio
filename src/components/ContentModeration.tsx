import { useEffect, useState } from 'react';
import { nightjarCatalogue } from '../platform/firebase-catalogue';
import { Check, Eye, FileAudio, MessageSquare, X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  notify: (message: string) => void;
};

export default function ContentModeration({ open, onClose, notify }: Props) {
  const [queue, setQueue] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await nightjarCatalogue.moderationQueue();
      setQueue(data.releases ?? []);
    } catch { notify('Release moderation queue could not be loaded.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) void load(); }, [open]);

  useEffect(() => {
    let cancelled = false;
    setPreviewUrl(null);
    if (!selected?.id || !selected.audioAvailable) return () => { cancelled = true; };
    void nightjarCatalogue.adminPreview(selected.id).then((data) => {
      if (!cancelled) setPreviewUrl(data.url);
    }).catch(() => {
      if (!cancelled) notify('Release audio preview could not be opened.');
    });
    return () => { cancelled = true; };
  }, [selected?.id, selected?.audioAvailable]);

  const decide = async (decision: 'approved' | 'changes' | 'rejected') => {
    if (!selected?.id) return;
    const note = decision === 'changes' ? (window.prompt('What should the creator change?') ?? '') : (window.prompt('Moderator note (optional)') ?? '');
    try {
      await nightjarCatalogue.moderate(selected.id, decision, note);
      await load();
      setSelected(null);
      notify(decision === 'approved' ? 'Release approved and published.' : decision === 'changes' ? 'Changes requested from the creator.' : 'Release rejected.');
    } catch { notify('Moderation decision could not be saved.'); }
  };

  if (!open) return null;
  return <div className="admin-panel-modal" role="dialog" aria-modal="true">
    <section className="moderation-modal">
      <div className="admin-modal-head"><div><span className="mini-label">ADMINISTRATION / CONTENT</span><h2>Release moderation</h2><p>Preview the actual submission before it reaches the public adult catalogue.</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>
      <div className="moderation-layout">
        <aside className="moderation-queue">{loading ? <div className="people-empty">Loading moderation queue…</div> : queue.length ? queue.map((release) => <button key={release.id} className={selected?.id === release.id ? 'moderation-item active' : 'moderation-item'} onClick={() => setSelected(release)}><FileAudio size={16} /><span><strong>{release.title}</strong><small>{release.creatorName || 'Creator'} · {release.category || 'Audio'}</small></span></button>) : <div className="people-empty"><Check size={18} /><strong>Queue is clear.</strong><span>New creator submissions will appear here.</span></div>}</aside>
        <article className="moderation-preview">{selected ? <><div className="moderation-preview-head"><div><span className="mini-label">{selected.category || 'AUDIO'}</span><h3>{selected.title}</h3><p>By {selected.creatorName || 'Nightjar creator'} · {selected.creatorHandle ? '@' + selected.creatorHandle.replace(/^@/, '') : 'handle not set'}</p></div>{previewUrl && <audio className="moderation-audio" controls src={previewUrl} />}</div><div className="moderation-copy"><p>{selected.description || 'No description.'}</p><div className="moderation-tags">{[...(selected.tags || []), ...(selected.tropes || [])].map((tag:string) => <span key={tag}>{tag}</span>)}</div></div><div className="moderation-actions"><button className="secondary-button" onClick={() => void decide('changes')}><MessageSquare size={14} /> Request changes</button><button className="ghost-button" onClick={() => void decide('rejected')}><X size={14} /> Reject</button><button className="primary-button" onClick={() => void decide('approved')}><Check size={14} /> Approve & publish</button></div></> : <div className="people-empty"><Eye size={19} /><strong>Select a release.</strong><span>Moderation shows the actual audio and metadata together.</span></div>}</article>
      </div>
    </section>
  </div>;
}
