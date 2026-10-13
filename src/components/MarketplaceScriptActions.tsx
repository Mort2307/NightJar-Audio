import { useState } from 'react';
import { ArrowRight, FileKey2, LockKeyhole, MessageCircle, ShieldCheck, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import ContextHelp from './ContextHelp';
import { nightjarScripts } from '../platform/firebase-scripts';
import { nightjarCollaboration } from '../platform/firebase-collaboration';
import { nightjarMessaging } from '../platform/firebase-messaging';
import { nightjarLicenceOffers } from '../platform/firebase-licence-offers';
import './marketplace-script-actions.css';

type Props={script:any;readOnlyPreview:boolean;demoMode:boolean;simulationMode:boolean;notify:(message:string)=>void;onMessageUser?:(userId:string,collaborationId?:string|null)=>void};
const pounds=(pence:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pence/100);
export default function MarketplaceScriptActions({script,readOnlyPreview,demoMode,simulationMode,notify,onMessageUser}:Props){
  const [sample,setSample]=useState<{scriptId:string;title:string;sample:string}|null>(null);
  const [sampleBusy,setSampleBusy]=useState(false);
  const [mode,setMode]=useState<'question'|'licence'|null>(null);
  const [body,setBody]=useState('');
  const [price,setPrice]=useState(script.marketplace?.commissionPricePence?(script.marketplace.commissionPricePence/100).toFixed(2):'');
  const [licenceType,setLicenceType]=useState<'non-exclusive'|'exclusive'>('non-exclusive');
  const [months,setMonths]=useState(12);
  const [usage,setUsage]=useState('Audio adaptation for NightJar distribution');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const openSample=async()=>{
    if(readOnlyPreview||demoMode)return notify('Protected samples are available to verified live VA accounts.');
    setSampleBusy(true);
    try{setSample(await nightjarScripts.marketplaceSample(script.id));}
    catch(cause){notify(cause instanceof Error?cause.message:'The Writer has not authorised a preview.');}
    finally{setSampleBusy(false);}
  };
  const openContact=(next:'question'|'licence')=>{
    if(readOnlyPreview||(demoMode&&!simulationMode))return notify('This action requires an authorised VA account.');
    setMode(next);setError('');setBody('');
  };
  const send=async()=>{
    if(!mode||!body.trim()||busy)return;
    const amountPence=Math.round(Number(price)*100);
    if(mode==='licence'&&(!Number.isSafeInteger(amountPence)||amountPence<100||amountPence>10000000||!usage.trim()||!Number.isInteger(months)||months<1||months>120)){
      setError('Offer £1–£100,000 with a 1–120 month duration and a description of intended use.');return;
    }
    if(demoMode){notify('Simulation: no real correspondence or licence offer was sent.');setMode(null);return;}
    setBusy(true);setError('');let saved=false;
    try{
      let collaborationId:string|undefined;
      if(mode==='licence'){
        await nightjarLicenceOffers.create(script.id,{amountPence,licenceType,termMonths:months,usageDetails:usage.trim()});
      }else{
        const result=await nightjarCollaboration.expressInterest(script.id,body.trim());
        collaborationId=result.proposal?.id;
      }
      saved=true;
      const conversation=await nightjarMessaging.start(script.writerUserId,'',collaborationId);
      const id=conversation.conversation?.id;
      if(!id)throw new Error('Could not open the direct-message conversation.');
      const firstMessage=mode==='licence'
        ? 'Rights offer regarding '+script.title+': '+pounds(amountPence)+' · '+licenceType+' · '+months+' months.\nProposed audio use: '+usage.trim()+'\n\n'+body.trim()+'\n\nThis is an offer only; no payment or licence has been granted.'
        : body.trim();
      await nightjarMessaging.send(id,firstMessage,collaborationId);
      setMode(null);
      notify(mode==='licence'?'Rights offer and message sent. Track responses in the licence workspace.':'Your enquiry was sent directly to the Writer.');
      onMessageUser?.(script.writerUserId,collaborationId??null);
    }catch(cause){
      const reason=cause instanceof Error?cause.message:'The request failed.';
      setError(saved?'The proposal was recorded, but the message could not be delivered: '+reason+'. Open Messages to contact the Writer.':reason);
    }finally{setBusy(false);}
  };
  const modal=typeof document!=='undefined'&&(
    <>
      {sample&&<div className="marketplace-modal-overlay" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setSample(null);}}>
        <section className="marketplace-modal marketplace-sample-modal" role="dialog" aria-modal="true" aria-label={'Protected sample: '+sample.title}
          onCopy={e=>e.preventDefault()} onCut={e=>e.preventDefault()} onContextMenu={e=>e.preventDefault()} onDragStart={e=>e.preventDefault()}>
          <header><div><span className="mini-label">NIGHTJAR · WRITER-AUTHORISED SAMPLE</span><h3>{sample.title}</h3><p><ShieldCheck size={14}/> Protected read-only excerpt · access recorded <ContextHelp topic="protected-reader" placement="end"/></p></div><button className="secondary-button" onClick={()=>setSample(null)}><X size={14}/> Close</button></header>
          <div className="marketplace-modal-body marketplace-sample-text"><p className="marketplace-excerpt-watermark" aria-hidden="true">NIGHTJAR · SAMPLE ONLY · {sample.scriptId.slice(-10)}</p>{sample.sample}</div>
          <footer>Copyright remains with the Writer. Previewing does not grant reproduction, performance or licensing rights.</footer>
        </section>
      </div>}
      {mode&&<div className="marketplace-modal-overlay" role="presentation" onClick={e=>{if(e.target===e.currentTarget&&!busy)setMode(null);}}>
        <section className="marketplace-modal" role="dialog" aria-modal="true" aria-label="Script enquiry and rights offer">
          <header><div><span className="mini-label">CONTACT & RIGHTS</span><h3>{script.title}</h3><p>Writer: {script.writerName}</p></div><button className="secondary-button" disabled={busy} onClick={()=>setMode(null)}><X size={14}/> Close</button></header>
          <div className="marketplace-modal-body marketplace-offer-form">
            <div className="marketplace-offer-modes"><button className={mode==='question'?'primary-button':'secondary-button'} onClick={()=>setMode('question')}>Ask a question</button><button className={mode==='licence'?'primary-button':'secondary-button'} onClick={()=>setMode('licence')}>Offer to licence</button></div>
            {mode==='licence'&&<div className="marketplace-offer-terms">
              <label><span className="nj-term-label">Offer price (£) <ContextHelp topic="licence-price"/></span><input type="number" value={price} min="1" max="100000" step=".01" onChange={e=>setPrice(e.target.value)}/></label>
              <label><span className="nj-term-label">Rights <ContextHelp topic="licence-choice"/></span><select value={licenceType} onChange={e=>setLicenceType(e.target.value as 'non-exclusive'|'exclusive')}><option value="non-exclusive">Non-exclusive</option><option value="exclusive">Exclusive</option></select></label>
              <label><span className="nj-term-label">Duration in months <ContextHelp topic="licence-term"/></span><input type="number" value={months} min="1" max="120" onChange={e=>setMonths(Number(e.target.value))}/></label>
              <label className="marketplace-offer-span"><span className="nj-term-label">Intended audio use <ContextHelp topic="usage-rights"/></span><textarea maxLength={1200} rows={3} value={usage} onChange={e=>setUsage(e.target.value)}/></label>
            </div>}
            <label>Your message to the Writer<textarea value={body} maxLength={1600} rows={4} onChange={e=>setBody(e.target.value)} placeholder="Introduce yourself, ask about the script or explain your licensing proposal…"/></label>
            {mode==='licence'&&<p className="marketplace-offer-warning"><ShieldCheck size={15}/> <ContextHelp topic="licence-status"/> This records an offer and starts a conversation, not a purchase. No charge or licence transfer can occur until compliant payment and final contract verification are enabled.</p>}
            {error&&<p className="manuscript-review-error" role="alert">{error}</p>}
          </div>
          <footer><button className="primary-button" disabled={busy||!body.trim()} onClick={()=>void send()}>{busy?'Sending…':mode==='licence'?'Send rights offer & message':'Send enquiry & message'} <ArrowRight size={14}/></button></footer>
        </section>
      </div>}
    </>
  );
  return <div className="marketplace-script-actions">
    {script.marketplace?.sampleAvailable&&<span className="nj-term-label"><button type="button" className="secondary-button" disabled={sampleBusy||readOnlyPreview} onClick={()=>void openSample()}><LockKeyhole size={14}/>{sampleBusy?'Opening…':'Read protected sample'}</button><ContextHelp topic="protected-sample"/></span>}
    {readOnlyPreview?<span className="status-pill muted">Read-only live preview</span>:<>
      <button className="secondary-button" onClick={()=>openContact('question')}><MessageCircle size={14}/> Ask Writer</button>
      <button className="primary-button" onClick={()=>openContact('licence')}><FileKey2 size={14}/> Make rights offer</button>
    </>}
    {modal?createPortal(modal,document.body):null}
  </div>;
}
