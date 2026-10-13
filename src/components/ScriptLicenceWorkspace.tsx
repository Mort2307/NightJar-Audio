import { useEffect, useState } from 'react';
import { ArrowRight, FileKey2, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { nightjarLicenceOffers, type ScriptLicenceOffer, type ScriptLicenceTerms } from '../platform/firebase-licence-offers';
import ContextHelp from './ContextHelp';
import './script-licence-workspace.css';

const money=(pence:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pence/100);
type Props={
  role:'writer'|'creator';currentUserId?:string|null;demoMode?:boolean;simulationMode?:boolean;
  notify:(message:string)=>void;onMessageUser?:(uid:string)=>void;
};
export default function ScriptLicenceWorkspace({role,currentUserId,demoMode=false,simulationMode=false,notify,onMessageUser}:Props){
  const [offers,setOffers]=useState<ScriptLicenceOffer[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null);
  const [counterId,setCounterId]=useState<string|null>(null);
  const [amount,setAmount]=useState('');
  const [licenceType,setLicenceType]=useState<'non-exclusive'|'exclusive'>('non-exclusive');
  const [months,setMonths]=useState(12);
  const [usage,setUsage]=useState('');
  const [error,setError]=useState('');
  const load=async()=>{
    setLoading(true);
    try{if(demoMode){setOffers([]);return;}
      const data=await nightjarLicenceOffers.list();
      setOffers(data.offers??[]);setError('');
    }catch(cause){setError(cause instanceof Error?cause.message:'Offers could not be loaded.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[role,demoMode]);
  const openCounter=(o:ScriptLicenceOffer)=>{
    setCounterId(o.id);setAmount((o.amountPence/100).toFixed(2));
    setLicenceType(o.licenceType);setMonths(o.termMonths);setUsage(o.usageDetails);
  };
  const respond=async(o:ScriptLicenceOffer,action:'accept'|'decline'|'counter'|'withdraw')=>{
    if(demoMode&&!simulationMode)return notify('Demo rights negotiations are read-only.');
    const terms:ScriptLicenceTerms|undefined=action==='counter'?{
      amountPence:Math.round(Number(amount)*100),licenceType,termMonths:months,usageDetails:usage.trim(),
    }:undefined;
    if(action==='counter'&&(!Number.isFinite(Number(amount))||Number(amount)<1||!usage.trim()))return setError('Enter valid terms and an offer of at least £1.');
    if(action==='accept'&&!window.confirm('Confirm acceptance of the proposed terms only? No money is collected and no script licence is granted until payment and a final agreement are independently verified.'))return;
    setBusy(o.id);setError('');
    try{
      if(demoMode){setOffers(items=>items.map(item=>item.id===o.id?{...item,status:action==='accept'?'terms_agreed_payment_pending':action==='counter'?'countered':action==='decline'?'declined':'withdrawn',lastProposerUserId:action==='counter'?(currentUserId??'demo'):item.lastProposerUserId,...(terms??{})}:item));}
      else{await nightjarLicenceOffers.respond(o.id,action,terms);await load();}
      setCounterId(null);
      notify(action==='accept'?'Terms recorded. Payment and rights transfer remain pending.':action==='counter'?'Counteroffer sent to the other party.':'Negotiation updated.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Offer response could not be saved.');}
    finally{setBusy(null);}
  };
  return <section className="research-panel script-licence-workspace" aria-label="Manuscript rights negotiations">
    <div className="research-panel-head">
      <div><span className="mini-label">MANUSCRIPT RIGHTS · NEGOTIATION WORKSPACE</span><h2>Offers and licensing discussions. <ContextHelp topic="licence-status"/></h2><p>Keep written terms and decisions in NightJar. This is a negotiation record—not a payment receipt or granted licence.</p></div>
      <button type="button" className="secondary-button" onClick={()=>void load()} disabled={loading}><RefreshCw size={14}/>{loading?'Loading…':'Refresh'}</button>
    </div>
    {error&&<p className="manuscript-review-error" role="alert">{error}</p>}
    {!loading&&offers.length===0&&<p className="script-licence-empty">No script licence offers yet. VAs can open a listed manuscript and send a structured offer to its Writer.</p>}
    <div className="script-licence-list">{offers.map(o=>{
      const otherId=role==='writer'?o.creatorUserId:o.writerUserId;
      const canReply=['proposed','countered'].includes(o.status)&&o.lastProposerUserId!==currentUserId;
      const canWithdraw=['proposed','countered'].includes(o.status)&&role==='creator';
      return <article className="script-licence-card" key={o.id}>
        <header><div><strong>{o.scriptTitle}</strong><small className="nj-term-label">Revision {o.revision} · {o.status.replaceAll('_',' ')} <ContextHelp topic="licence-status"/></small></div><span className="status-pill">{money(o.amountPence)}</span></header>
        <div className="script-licence-details"><span className="nj-term-label">{o.licenceType} audio licence <ContextHelp topic={o.licenceType==='exclusive'?'exclusive-licence':'non-exclusive-licence'}/></span><span className="nj-term-label">{o.termMonths} month{o.termMonths===1?'':'s'} <ContextHelp topic="licence-term"/></span><span>GBP</span></div>
        <p>{o.usageDetails}</p>
        <p className="script-licence-safety"><ShieldCheck size={15}/> No payment collected. Writer copyright remains protected; no licence has been granted.</p>
        <div className="script-licence-actions">
          {onMessageUser&&<button className="secondary-button" onClick={()=>onMessageUser(otherId)}><MessageCircle size={14}/> Message {role==='writer'?'VA':'Writer'}</button>}
          {canReply&&<button className="secondary-button" disabled={!!busy} onClick={()=>openCounter(o)}><FileKey2 size={14}/> Counteroffer</button>}
          {canReply&&<button className="primary-button" disabled={!!busy} onClick={()=>void respond(o,'accept')}>Agree terms <ArrowRight size={14}/></button>}
          {canReply&&<button className="ghost-button" disabled={!!busy} onClick={()=>void respond(o,'decline')}>Decline</button>}
          {canWithdraw&&<button className="ghost-button" disabled={!!busy} onClick={()=>void respond(o,'withdraw')}>Withdraw</button>}
        </div>
        {counterId===o.id&&<div className="script-licence-counter">
          <label><span className="nj-term-label">Counter price (£) <ContextHelp topic="licence-price"/></span><input type="number" min="1" max="100000" step=".01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
          <label><span className="nj-term-label">Licence <ContextHelp topic="licence-choice"/></span><select value={licenceType} onChange={e=>setLicenceType(e.target.value as 'non-exclusive'|'exclusive')}><option value="non-exclusive">Non-exclusive</option><option value="exclusive">Exclusive</option></select></label>
          <label><span className="nj-term-label">Term (months) <ContextHelp topic="licence-term"/></span><input type="number" min="1" max="120" value={months} onChange={e=>setMonths(Number(e.target.value))}/></label>
          <label className="script-licence-wide"><span className="nj-term-label">Intended audio use <ContextHelp topic="usage-rights"/></span><textarea maxLength={1200} value={usage} onChange={e=>setUsage(e.target.value)} rows={3}/></label>
          <button className="primary-button" disabled={!!busy} onClick={()=>void respond(o,'counter')}>Send counteroffer</button>
          <button className="secondary-button" onClick={()=>setCounterId(null)}>Cancel</button>
        </div>}
      </article>;
    })}</div>
    <p className="script-licence-disclaimer"><ContextHelp topic="licence-status"/> Payments, escrow and legal licence execution are disabled until NightJar completes its approved processor and contract setup. Accepting terms alone does not authorise use, copying, recording or publication of the manuscript.</p>
  </section>;
}
