import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Filter, Search } from 'lucide-react';
import { nightjarScripts } from '../platform/firebase-scripts';
import { nightjarCollaboration } from '../platform/firebase-collaboration';

type Props = {
  notify: (message: string) => void;
  onOpenWriter?: (userId: string) => void;
};

export default function ScriptMarketplace({ notify, onOpenWriter }: Props) {
  const [scripts, setScripts] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await nightjarScripts.marketplace();
      setScripts(data.scripts ?? []);
    } catch {
      notify('Script marketplace could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return scripts;
    return scripts.filter((script) => [
      script.title,
      script.writerName,
      script.writerHandle,
      script.marketplace?.synopsis,
      ...(script.marketplace?.genres ?? []),
      ...(script.marketplace?.tropes ?? []),
    ].filter(Boolean).join(' ').toLowerCase().includes(value));
  }, [scripts, query]);

  const expressInterest = async (script: any) => {
    const message = window.prompt('Optional message to the Writer about why this script interests you.') ?? '';
    try {
      await nightjarCollaboration.expressInterest(script.id, message);
      notify('Interest sent to the Writer. The proposal is now visible in your Collaboration Workspace.');
    } catch {
      notify('Interest could not be sent.');
    }
  };

  return <section className="research-panel script-marketplace">
    <div className="research-panel-head">
      <div><span className="mini-label">SCRIPT MARKETPLACE</span><h2>Find the story before it becomes an audio.</h2><p>Only approved scripts intentionally listed by their Writer appear here. Full manuscripts remain protected.</p></div>
      <BookOpen size={22}/>
    </div>
    <label className="marketplace-search"><Search size={15}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search Writer, title, genre or trope"/></label>
    {loading ? <div className="people-empty">Loading marketplace…</div> : <div className="marketplace-grid">
      {filtered.map((script) => <article className="marketplace-card" key={script.id}>
        <div className="marketplace-card-head"><span>{script.rights?.licenceType && script.rights.licenceType !== 'none' ? script.rights.licenceType : 'Licence to discuss'}</span><Filter size={15}/></div>
        <h3>{script.title}</h3>
        <button className="marketplace-writer" type="button" onClick={()=>script.writerUserId && onOpenWriter?.(script.writerUserId)}>{script.writerName}{script.writerHandle ? ' · @' + String(script.writerHandle).replace(/^@/,'') : ''}</button>
        <p>{script.marketplace?.synopsis || 'Writer has not added a public synopsis yet.'}</p>
        <div className="marketplace-tags">{[...(script.marketplace?.genres ?? []), ...(script.marketplace?.tropes ?? [])].slice(0,8).map((item:string)=><span key={item}>{item}</span>)}</div>
        <dl className="marketplace-rights">
          <div><dt>Copyright</dt><dd>{script.rights?.writerRetainsCopyright !== false ? 'Writer retained' : 'See agreement'}</dd></div>
          <div><dt>AI training</dt><dd>Not permitted</dd></div>
          <div><dt>Indicative fee</dt><dd>{script.marketplace?.commissionPricePence == null ? 'Discuss' : new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(script.marketplace.commissionPricePence/100)}</dd></div>
        </dl>
        <button className="primary-button" type="button" onClick={()=>void expressInterest(script)}>I’m interested <ArrowRight size={14}/></button>
      </article>)}
      {!filtered.length && <div className="people-empty"><BookOpen size={18}/><strong>No matching scripts.</strong><span>Approved Writer listings will appear here when they are made available.</span></div>}
    </div>}
  </section>;
}
