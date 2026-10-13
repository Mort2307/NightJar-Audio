import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Filter, Search } from 'lucide-react';
import MarketplaceScriptActions from './MarketplaceScriptActions';
import { nightjarScripts } from '../platform/firebase-scripts';
import { demoMarketplaceScripts } from '../demo/nightjarDemo';

type Props = {
  notify: (message: string) => void;
  onOpenWriter?: (userId: string) => void;
  demoMode?: boolean;
  simulationMode?: boolean;
  readOnlyPreview?: boolean;
  onAdminAudit?: () => void;
  onMessageUser?: (userId:string,collaborationId?:string|null) => void;
};

export default function ScriptMarketplace({ notify, onOpenWriter, onMessageUser, demoMode = false, simulationMode = false, readOnlyPreview = false, onAdminAudit }: Props) {
  const [scripts, setScripts] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      if (demoMode) setScripts(structuredClone(demoMarketplaceScripts));
      else {
        const data = await nightjarScripts.marketplace();
        setScripts(data.scripts ?? []);
      }
    } catch {
      setScripts([]);
      setLoadError(true);
      notify('Script marketplace could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [demoMode]);

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

  return <section className="research-panel script-marketplace">
    <div className="research-panel-head">
      <div><span className="mini-label">{readOnlyPreview ? 'LIVE SCRIPT MARKETPLACE · ADMIN READ-ONLY' : 'SCRIPT MARKETPLACE'}</span><h2>Find the story before it becomes an audio.</h2><p>Only approved scripts intentionally listed by their Writer appear here. Full manuscripts remain protected.</p></div>
      <BookOpen size={22}/>
    </div>
    <label className="marketplace-search"><Search size={15}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search Writer, title, genre or trope"/></label>
    {loading ? <div className="people-empty">Loading approved real scripts…</div> :
    loadError ? <div className="marketplace-empty-state" role="alert"><BookOpen size={21}/><div><strong>Marketplace unavailable</strong><p>Live scripts could not be loaded. This is not evidence that the marketplace is empty.</p></div><button className="secondary-button" type="button" data-nj-preview-safe={readOnlyPreview ? "true" : undefined} onClick={() => void load()}>Try again</button></div>
    : <div className="marketplace-grid">
      {filtered.map((script) => <article className="marketplace-card" key={script.id}>
        <div className="marketplace-card-head"><span>{script.rights?.licenceType && script.rights.licenceType !== 'none' ? script.rights.licenceType : 'Licence to discuss'}</span><Filter size={15}/></div>
        {script.artworkUrl && <img className="script-marketplace-cover" src={script.artworkUrl} alt={'Approved cover artwork for ' + script.title} loading="lazy" decoding="async"/>}
        <h3>{script.title}</h3>
        {onOpenWriter ? <button className="marketplace-writer" type="button" data-nj-preview-safe={readOnlyPreview ? "true" : undefined} disabled={!script.writerUserId} onClick={()=>script.writerUserId && onOpenWriter(script.writerUserId)}>{script.writerName}{script.writerHandle ? ' · @' + String(script.writerHandle).replace(/^@/,'') : ''}</button> : <span className="marketplace-writer">{script.writerName}{script.writerHandle ? ' · @' + String(script.writerHandle).replace(/^@/,'') : ''}</span>}
        <p>{script.marketplace?.synopsis || 'Writer has not added a public synopsis yet.'}</p>
        <div className="marketplace-tags">{[...(script.marketplace?.genres ?? []), ...(script.marketplace?.tropes ?? [])].slice(0,8).map((item:string)=><span key={item}>{item}</span>)}</div>
        <dl className="marketplace-rights">
          <div><dt>Copyright</dt><dd>{script.rights?.writerRetainsCopyright !== false ? 'Writer retained' : 'See agreement'}</dd></div>
          <div><dt>AI training</dt><dd>Not permitted</dd></div>
          <div><dt>Indicative fee</dt><dd>{script.marketplace?.commissionPricePence == null ? 'Discuss' : new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(script.marketplace.commissionPricePence/100)}</dd></div>
        </dl>
        <MarketplaceScriptActions key={'script-action-'+script.id} script={script} notify={notify} onMessageUser={onMessageUser} readOnlyPreview={readOnlyPreview} demoMode={demoMode} simulationMode={simulationMode}/>
      </article>)}
      {!filtered.length && <div className="marketplace-empty-state"><BookOpen size={24}/><div>
        <strong>{scripts.length > 0 ? 'No scripts match this search.' : 'No Writer scripts are publicly listed yet.'}</strong>
        <p>{scripts.length > 0 ? 'Try a different title, genre, Writer or trope.' : 'Only approved manuscripts explicitly made visible by their Writer enter the live marketplace. Uploaded drafts and pending approvals remain protected.'}</p>
      </div>
      {readOnlyPreview && onAdminAudit && scripts.length === 0 && <button data-nj-preview-safe="true" type="button" className="secondary-button" onClick={onAdminAudit}>Check actual upload visibility <ArrowRight size={15}/></button>}
      </div>}
    </div>}
  </section>;
}
