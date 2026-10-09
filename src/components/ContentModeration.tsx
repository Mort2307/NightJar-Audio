import { useEffect, useState } from 'react';
import { nightjarCatalogue } from '../platform/firebase-catalogue';
import { demoCreatorDashboard, demoTracks } from '../demo/nightjarDemo';
import { readDemo, writeDemo } from '../demo/demoSession';
import { BookOpenText, Check, Eye, FileAudio, MessageSquare, X } from 'lucide-react';

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
        setQueue(readDemo('creatorDashboard', demoCreatorDashboard).releases.filter((release: any) => release.status === 'pending_review').map((release: any) => ({
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
    if (decision === 'approved' && !demoMode && (!String(selected.transcriptText ?? '').trim() || selected.transcriptAccessibilityReviewed !== true)) {
      notify('This release needs a reviewed final transcript before it can be published.');
      return;
    }
    const note = decision === 'changes' ? (window.prompt('What should the creator change?') ?? '') : (window.prompt('Moderator note (optional)') ?? '');
    try {
      if (demoMode) {
        const dashboard = readDemo('creatorDashboard', demoCreatorDashboard);
        const status = decision === 'approved' ? 'released' : decision === 'changes' ? 'draft' : 'rejected';
        const releases = dashboard.releases.map((release: any) => release.id === selected.id ? { ...release, status, moderationNote: note } : release);
        writeDemo('creatorDashboard', { ...dashboard, releases });
        if (decision === 'approved') {
          const tracks = readDemo('tracks', demoTracks);
          writeDemo('tracks', [...tracks.filter((track: any) => track.id !== selected.id), {
            id: selected.id, title: selected.title, creator: selected.creatorName || 'Aria Vale',
            creatorUserId: 'demo-creator-aria', duration: String(selected.durationMinutes || 0) + ' min',
            category: selected.category || 'Audio', descriptor: selected.description || 'Demo release',
            genre: selected.genre || '', tags: selected.tags || [], tropes: selected.tropes || [],
            contributors: selected.contributors || [], contentRating: selected.contentRating || 'adult',
            audioAvailable: selected.audioAvailable === true, audioUrl: null, artworkUrl: null,
          }]);
        }
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
        <article className="moderation-preview">{selected ? <><div className="moderation-preview-head"><div><span className="mini-label">{selected.category || 'AUDIO'}</span><h3>{selected.title}</h3><p>By {selected.creatorName || 'Nightjar creator'} · {selected.creatorHandle ? '@' + selected.creatorHandle.replace(/^@/, '') : 'handle not set'}</p></div>{previewUrl && <audio className="moderation-audio" controls src={previewUrl} />}</div><div className="moderation-copy"><p>{selected.description || 'No description.'}</p>{selected.productionNote && <p><strong>Behind the scenes:</strong> {selected.productionNote}</p>}
          <section className="moderation-transcript-review">
            <div className="moderation-transcript-head">
              <div><span className="mini-label">ACCESSIBILITY TRANSCRIPT</span><strong><BookOpenText size={15}/> Final-release text alternative</strong></div>
              <span className={String(selected.transcriptText ?? '').trim() && selected.transcriptAccessibilityReviewed === true ? 'status-pill' : 'status-pill muted'}>
                {String(selected.transcriptText ?? '').trim() && selected.transcriptAccessibilityReviewed === true ? 'CREATOR REVIEWED' : 'NOT READY'}
              </span>
            </div>
            {String(selected.transcriptText ?? '').trim()
              ? <pre className="moderation-transcript-copy">{String(selected.transcriptText)}</pre>
              : <div className="people-empty"><BookOpenText size={16}/><strong>No transcript supplied.</strong><span>Request changes before publishing this release.</span></div>}
            <small>{selected.transcriptLanguage || 'en'} · {Math.max(0, Number(selected.transcriptWordCount ?? 0)).toLocaleString('en-GB')} words</small>
          </section>
          <div className="moderation-tags">{[...(selected.tags || []), ...(selected.tropes || [])].map((tag:string) => <span key={tag}>{tag}</span>)}</div>{!!selected.contributors?.length && <div className="moderation-credit-list">{selected.contributors.map((credit:any)=><span key={credit.role + ':' + credit.name}>{credit.role}: {credit.name}</span>)}</div>}<label className="rights-check moderation-original-check"><input type="checkbox" checked={nightjarOriginal} onChange={(e)=>setNightjarOriginal(e.target.checked)}/> Designate as a Nightjar Original on approval</label></div><div className="moderation-actions"><button className="secondary-button" onClick={() => void decide('changes')}><MessageSquare size={14} /> Request changes</button><button className="ghost-button" onClick={() => void decide('rejected')}><X size={14} /> Reject</button><button className="primary-button" disabled={!demoMode && (!String(selected.transcriptText ?? '').trim() || selected.transcriptAccessibilityReviewed !== true)} onClick={() => void decide('approved')}><Check size={14} /> Approve & publish</button></div></> : <div className="people-empty"><Eye size={19} /><strong>Select a release.</strong><span>Moderation shows the actual audio and metadata together.</span></div>}</article>
      </div>
    </section>
  </div>;
}
