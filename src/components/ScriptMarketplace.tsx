import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Filter, Search } from 'lucide-react';
import MarketplaceScriptActions from './MarketplaceScriptActions';
import ContextHelp from './ContextHelp';
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
  focusScriptId?: string | null;
};

export default function ScriptMarketplace({ notify, onOpenWriter, onMessageUser, demoMode = false, simulationMode = false, readOnlyPreview = false, onAdminAudit, focusScriptId = null }: Props) {
  const [scripts, setScripts] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const jumpedToScriptId = useRef<string | null>(null);

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

  useEffect(() => {
    // Direct script links scroll once on arrival. Reloading the marketplace
    // or re-rendering Home must never repeatedly hijack the member's scroll.
    if (!focusScriptId) {
      jumpedToScriptId.current = null;
      return;
    }
    if (loading || jumpedToScriptId.current === focusScriptId) return;
    if (!scripts.some(script => script.id === focusScriptId)) return;
    setQuery('');
    const timer = window.setTimeout(() => {
      const target = document.getElementById('nightjar-marketplace-script-' + focusScriptId);
      if (!target || jumpedToScriptId.current === focusScriptId) return;
      jumpedToScriptId.current = focusScriptId;
      target.scrollIntoView({
        block: 'center',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [loading, scripts, focusScriptId]);

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
      <div><span className="mini-label">{readOnlyPreview ? 'LIVE SCRIPT MARKETPLACE · READ-ONLY BROWSING' : 'SCRIPT MARKETPLACE'}</span><h2>Find the story before it becomes an audio.</h2><p>Only approved scripts intentionally listed by their Writer appear here. Full manuscripts remain protected.</p></div>
      <BookOpen size={22}/>
    </div>
    <label className="marketplace-search"><Search size={15}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search Writer, title, genre or trope"/></label>
    {loading ? <div className="people-empty">Loading approved real scripts…</div> :
    loadError ? <div className="marketplace-empty-state" role="alert"><BookOpen size={21}/><div><strong>Marketplace unavailable</strong><p>Live scripts could not be loaded. This is not evidence that the marketplace is empty.</p></div><button className="secondary-button" type="button" data-nj-preview-safe={readOnlyPreview ? "true" : undefined} onClick={() => void load()}>Try again</button></div>
    : <div className="marketplace-grid">
      {filtered.map((script) => <article className={focusScriptId === script.id ? "marketplace-card nightjar-notification-target" : "marketplace-card"} key={script.id} id={"nightjar-marketplace-script-" + script.id}>
        <div className="marketplace-card-head"><span className="nj-term-label">{script.rights?.licenceType && script.rights.licenceType !== 'none' ? script.rights.licenceType : 'Licence to discuss'} <ContextHelp topic={script.rights?.licenceType==='exclusive'?'exclusive-licence':script.rights?.licenceType==='non-exclusive'?'non-exclusive-licence':'licence-choice'}/></span><Filter size={15}/></div>
        {script.artworkUrl && <img className="script-marketplace-cover" src={script.artworkUrl} alt={'Approved cover artwork for ' + script.title} loading="lazy" decoding="async"/>}
        <h3>{script.title}</h3>
        {onOpenWriter ? <button className="marketplace-writer" type="button" data-nj-preview-safe={readOnlyPreview ? "true" : undefined} disabled={!script.writerUserId} onClick={()=>script.writerUserId && onOpenWriter(script.writerUserId)}>{script.writerName}{script.writerHandle ? ' · @' + String(script.writerHandle).replace(/^@/,'') : ''}</button> : <span className="marketplace-writer">{script.writerName}{script.writerHandle ? ' · @' + String(script.writerHandle).replace(/^@/,'') : ''}</span>}
        <p>{script.marketplace?.synopsis || 'Writer has not added a public synopsis yet.'}</p>
        <p className="nj-term-label">Writer asking price: <strong>{typeof script.marketplace?.commissionPricePence === 'number' && script.marketplace.commissionPricePence > 0 ? new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(script.marketplace.commissionPricePence/100) : 'Contact for pricing'}</strong> <ContextHelp topic="licence-price"/></p>
        <div className="marketplace-tags">{[...(script.marketplace?.genres ?? []), ...(script.marketplace?.tropes ?? [])].slice(0,8).map((item:string)=><span key={item}>{item}</span>)}</div>
        <dl className="marketplace-rights">
          <div><dt className="nj-term-label">Copyright <ContextHelp topic="copyright"/></dt><dd>{script.rights?.writerRetainsCopyright !== false ? 'Writer retained' : 'See agreement'}</dd></div>
          <div><dt>AI training</dt><dd>Not permitted</dd></div>
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
