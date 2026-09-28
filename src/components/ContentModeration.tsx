import { useEffect, useState } from 'react';
import { nightjarCatalogue } from '../platform/firebase-catalogue';
import { demoCreatorDashboard } from '../demo/nightjarDemo';
import { Check, Eye, FileAudio, MessageSquare, X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  notify: (message: string) => void;
  demoMode?: boolean;
};

export default function ContentModeration({ open, onClose, notify, demoMode = false }: Props) {
  const [queue, setQueue] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [nightjarOriginal, setNightjarOriginal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      if (demoMode) {
        setQueue(structuredClone(demoCreatorDashboard.releases.filter((release: any) => release.status === 'pending_review')).map((release: any) => ({
          ...release,
          creatorName: 'Aria Vale',
          creatorHandle: 'ariavale',
        })));
        setSelected(null);
        return;
      }
      const data = await nightjarCatalogue.moderationQueue();
      setQueue(data.releases ?? []);
    } catch { notify('Release moderation queue could not be loaded.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) void load(); }, [open, demoMode]);

  useEffect(() => {
    let cancelled = false;
    setPreviewUrl(null);
    setNightjarOriginal(selected?.nightjarOriginal === true);
    if (!selected?.id || !selected.audioAvailable || demoMode) return () => { cancelled = true; };
    void nightjarCatalogue.adminPreview(selected.id).then((data) => {
      if (!cancelled) setPreviewUrl(data.url);
    }).catch(() => {
      if (!cancelled) notify('Release audio preview could not be opened.');
    });
    return () => { cancelled = true; };
  }, [selected?.id, selected?.audioAvailable, demoMode]);

  const decide = async (decision: 'approved' | 'changes' | 'rejected') => {
    if (!selected?.id) return;
    const note = decision === 'changes' ? (window.prompt('What should the creator change?') ?? '') : (window.prompt('Moderator note (optional)') ?? '');
    try {
      if (demoMode) {
        setQueue((items) => items.filter((item) => item.id !== selected.id));
        setSelected(null);
        notify(decision === 'approved' ? 'Demo release approved locally.' : decision === 'changes' ? 'Demo changes request recorded locally.' : 'Demo release rejected locally.');
        return;
      }
      await nightjarCatalogue.moderate(selected.id, decision, note, decision === 'approved' && nightjarOriginal);
      await load();
      setSelected(null);
      notify(decision === 'approved' ? 'Release approved and published.' : decision === 'changes' ? 'Changes requested from the creator.' : 'Release rejected.');
    } catch { notify('Moderation decision could not be saved.'); }
  };

  if (!open) return null;
  return <div className="admin-panel-modal" role="dialog" aria-modal="true">
    <section className="moderation-modal">
      <div className="admin-modal-head"><div><span className="mini-label">ADMINISTRATION / CONTENT</span><h2>Release moderation</h2><p>{demoMode ? 'Fictional moderation queue. Decisions stay in this browser session and cannot publish live content.' : 'Preview the actual submission before it reaches the public adult catalogue.'}</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>
      <div className="moderation-layout">
        <aside className="moderation-queue">{loading ? <div className="people-empty">Loading moderation queue…</div> : queue.length ? queue.map((release) => <button key={release.id} className={selected?.id === release.id ? 'moderation-item active' : 'moderation-item'} onClick={() => setSelected(release)}><FileAudio size={16} /><span><strong>{release.title}</strong><small>{release.creatorName || 'Creator'} · {release.category || 'Audio'}</small></span></button>) : <div className="people-empty"><Check size={18} /><strong>Queue is clear.</strong><span>New creator submissions will appear here.</span></div>}</aside>
        <article className="moderation-preview">{selected ? <><div className="moderation-preview-head"><div><span className="mini-label">{selected.category || 'AUDIO'}</span><h3>{selected.title}</h3><p>By {selected.creatorName || 'Nightjar creator'} · {selected.creatorHandle ? '@' + selected.creatorHandle.replace(/^@/, '') : 'handle not set'}</p></div>{previewUrl && <audio className="moderation-audio" controls src={previewUrl} />}</div><div className="moderation-copy"><p>{selected.description || 'No description.'}</p>{selected.productionNote && <p><strong>Behind the scenes:</strong> {selected.productionNote}</p>}<div className="moderation-tags">{[...(selected.tags || []), ...(selected.tropes || [])].map((tag:string) => <span key={tag}>{tag}</span>)}</div>{!!selected.contributors?.length && <div className="moderation-credit-list">{selected.contributors.map((credit:any)=><span key={credit.role + ':' + credit.name}>{credit.role}: {credit.name}</span>)}</div>}<label className="rights-check moderation-original-check"><input type="checkbox" checked={nightjarOriginal} onChange={(e)=>setNightjarOriginal(e.target.checked)}/> Designate as a Nightjar Original on approval</label></div><div className="moderation-actions"><button className="secondary-button" onClick={() => void decide('changes')}><MessageSquare size={14} /> Request changes</button><button className="ghost-button" onClick={() => void decide('rejected')}><X size={14} /> Reject</button><button className="primary-button" onClick={() => void decide('approved')}><Check size={14} /> Approve & publish</button></div></> : <div className="people-empty"><Eye size={19} /><strong>Select a release.</strong><span>Moderation shows the actual audio and metadata together.</span></div>}</article>
      </div>
    </section>
  </div>;
}
