import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { FileText, Heart, Share2, X } from 'lucide-react';

type Writer = {
  userId: string;
  name: string;
  handle?: string | null;
  headline?: string | null;
  bio?: string | null;
  initials?: string | null;
  pronouns?: string | null;
  roleFocus?: string[];
  publishedWorkCount?: number;
};

type Props = {
  followingIds: string[];
  onToggleFollow: (profileUserId: string) => Promise<void>;
  notify: (message: string) => void;
};

export default function WriterDiscovery({ followingIds, onToggleFollow, notify }: Props) {
  const [writers, setWriters] = useState<Writer[]>([]);
  const [selected, setSelected] = useState<Writer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void api.get('/api/writers').then(({ data }) => {
      if (!cancelled) setWriters(data?.writers ?? []);
    }).catch(() => {
      if (!cancelled) notify('Writer discovery could not be loaded.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const share = async (writer: Writer) => {
    const url = window.location.origin + '/discover#writer-discovery-title';
    const text = 'Meet ' + writer.name + ' on Nightjar — a writer creating work for immersive audio.';
    try {
      if (navigator.share) await navigator.share({ title: 'Nightjar · ' + writer.name, text, url });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text + ' ' + url); notify('Writer profile copied — ready to share.'); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) notify('Writer sharing could not be opened.');
    }
  };

  return <>
    <section className="writer-discovery-section section-wrap" aria-labelledby="writer-discovery-title">
      <div className="section-head"><div><p className="eyebrow"><FileText size={14}/> WRITERS</p><h2 id="writer-discovery-title">Meet the people behind the words.</h2></div><span className="mini-label">{writers.length} PUBLIC WRITERS</span></div>
      <p className="section-copy">Writers can be discovered without exposing protected manuscript text. Public identity, creative focus and public-facing work counts stay separate from private production material.</p>
      {loading ? <div className="people-empty">Loading writers…</div> : <div className="writer-discovery-grid">{writers.map((writer) => <article className="writer-discovery-card" key={writer.userId}><span className="writer-discovery-avatar">{writer.initials || 'NJ'}</span><div><h3>{writer.name}</h3><span>{writer.handle ? '@' + writer.handle.replace(/^@/, '') : 'Writer'}</span><p>{writer.headline || writer.bio || 'An independent Nightjar writer.'}</p>{!!writer.roleFocus?.length && <div className="writer-focus-list">{writer.roleFocus.slice(0,4).map((item) => <span key={item}>{item}</span>)}</div>}<small>{writer.publishedWorkCount ?? 0} public-facing works</small></div><div className="writer-discovery-actions"><button className="secondary-button" onClick={() => setSelected(writer)}>Explore writer</button><button className="ghost-button" onClick={() => void onToggleFollow(writer.userId)}><Heart size={14} fill={followingIds.includes(writer.userId) ? 'currentColor' : 'none'}/> {followingIds.includes(writer.userId) ? 'Following' : 'Follow'}</button><button className="ghost-button" onClick={() => void share(writer)}><Share2 size={14}/> Share</button></div></article>)}</div>}
      {!loading && !writers.length && <div className="people-empty"><FileText size={18}/><strong>No public writers yet.</strong><span>Writer profiles will appear here as they choose to be discoverable.</span></div>}
    </section>

    {selected && <div className="creator-profile-backdrop" role="dialog" aria-modal="true" aria-label="Writer profile">
      <section className="creator-profile-modal">
        <header className="creator-profile-head"><div><span className="mini-label">NIGHTJAR / WRITER</span><h2>{selected.name}</h2><p>{selected.handle ? '@' + selected.handle.replace(/^@/, '') : 'Independent Nightjar writer'}</p></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close writer profile"><X size={18}/></button></header>
        <div className="creator-profile-body">
          <div className="creator-profile-hero"><span className="creator-profile-avatar">{selected.initials || 'NJ'}</span><div><h3>{selected.name}</h3><p>{selected.headline || 'Writer for immersive audio.'}</p>{selected.pronouns && <small>{selected.pronouns}</small>}</div><button className="secondary-button" onClick={() => void onToggleFollow(selected.userId)}><Heart size={14} fill={followingIds.includes(selected.userId) ? 'currentColor' : 'none'}/> {followingIds.includes(selected.userId) ? 'Following' : 'Follow writer'}</button><button className="ghost-button" onClick={() => void share(selected)}><Share2 size={14}/> Share</button></div>
          {selected.bio && <p className="creator-profile-bio">{selected.bio}</p>}
          {!!selected.roleFocus?.length && <div className="creator-profile-tags">{selected.roleFocus.map((item) => <span key={item}>{item}</span>)}</div>}
          <div className="writer-public-note"><FileText size={16}/><div><strong>Public writing, protected manuscripts.</strong><p>Nightjar can promote this writer's profile without exposing private manuscript text, collaboration permissions or protected drafts.</p></div></div>
          <div className="creator-profile-releases"><div className="section-head"><div><span className="mini-label">DISCOVERY</span><h3>{selected.publishedWorkCount ?? 0} public-facing works</h3></div></div></div>
        </div>
      </section>
    </div>}
  </>;
}
