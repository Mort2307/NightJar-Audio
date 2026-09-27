import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { FileText, Share2 } from 'lucide-react';

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
  notify: (message: string) => void;
  onOpenWriter: (writer: Writer) => void;
};

export default function WriterDiscovery({ notify, onOpenWriter }: Props) {
  const [writers, setWriters] = useState<Writer[]>([]);
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
    const url = window.location.origin + '/writers/' + encodeURIComponent(writer.handle || writer.userId);
    const text = 'Meet ' + writer.name + ' on Nightjar — a writer creating work for immersive audio.';
    try {
      if (navigator.share) await navigator.share({ title: 'Nightjar · ' + writer.name, text, url });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text + ' ' + url); notify('Writer spotlight copied — ready to share.'); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) notify('Writer sharing could not be opened.');
    }
  };

  return <section className="writer-discovery-section section-wrap" aria-labelledby="writer-discovery-title">
    <div className="section-head"><div><p className="eyebrow"><FileText size={14}/> WRITERS</p><h2 id="writer-discovery-title">Meet the people behind the words.</h2></div><span className="mini-label">{writers.length} PUBLIC WRITERS</span></div>
    <p className="section-copy">Writers can be discovered without exposing protected manuscript text. Public identity and public-facing work counts stay separate from private production material.</p>
    {loading ? <div className="people-empty">Loading writers…</div> : <div className="writer-discovery-grid">{writers.map((writer) => <article className="writer-discovery-card" key={writer.userId}><span className="writer-discovery-avatar">{writer.initials || 'NJ'}</span><div><h3>{writer.name}</h3><span>{writer.handle ? '@' + writer.handle.replace(/^@/, '') : 'Writer'}</span><p>{writer.headline || writer.bio || 'An independent Nightjar writer.'}</p>{!!writer.roleFocus?.length && <div className="writer-focus-list">{writer.roleFocus.slice(0,4).map((item) => <span key={item}>{item}</span>)}</div>}<small>{writer.publishedWorkCount ?? 0} public-facing works</small></div><div className="writer-discovery-actions"><button className="secondary-button" onClick={() => onOpenWriter(writer)}>Explore writer</button><button className="ghost-button" onClick={() => void share(writer)}><Share2 size={14}/> Share</button></div></article>)}</div>}
  </section>;
}
