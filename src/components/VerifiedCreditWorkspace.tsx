import { useCallback, useEffect, useState } from 'react';
import { verifiedCreditApi, type CreditClaim } from '../platform/firebase-verified-credits';

type Props = { currentUserId:string; administrator?: boolean; onNotice?: (message:string)=>void };
export default function VerifiedCreditWorkspace({currentUserId,administrator=false,onNotice}:Props) {
  const [claims,setClaims] = useState<CreditClaim[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState<string|null>(null);
  const [error,setError] = useState('');
  const [releaseId,setReleaseId] = useState('');
  const [slotId,setSlotId] = useState('');
  const [reviewReasons,setReviewReasons] = useState<Record<string,string>>({});
  const refresh = useCallback(async()=>{
    setLoading(true);setError('');
    try {setClaims(await (administrator ? verifiedCreditApi.adminClaims() : verifiedCreditApi.myClaims()));}
    catch(e) {setError(e instanceof Error?e.message:'Could not load credit claims.');}
    finally {setLoading(false);}
  },[administrator]);
  useEffect(()=>{void refresh();},[refresh]);
  const act = async (id:string,fn:()=>Promise<unknown>)=>{
    setBusy(id);setError('');
    try {await fn();onNotice?.('Credit claim updated.');await refresh();}
    catch(e) {setError(e instanceof Error?e.message:'Could not update claim.');}
    finally {setBusy(null);}
  };
  return <section className="panel nj-verified-credits" aria-label="Release credits">
    <header><span className="mini-label">RELEASE ATTRIBUTION</span><h2>{administrator?'Credit review queue':'Your release credits'}</h2>
      <p>Credits are linked to accounts only after the uploader confirms and an independent administrator approves. A credit does not grant publishing permissions or the official moon badge.</p></header>
    {!administrator && <form onSubmit={event=>{event.preventDefault();void act('new',()=>verifiedCreditApi.claim(releaseId.trim(),slotId.trim()).then(()=>{setReleaseId('');setSlotId('');}));}}>
      <label>Published release ID <input required maxLength={160} value={releaseId} onChange={e=>setReleaseId(e.target.value)} /></label>
      <label>Contributor slot ID <input required maxLength={160} value={slotId} onChange={e=>setSlotId(e.target.value)} /></label>
      <small>For existing releases, slot IDs are numbered from 0 in the order contributors appear. A direct credit action on each release will replace this manual entry.</small>
      <button type="submit" disabled={busy!==null}>I'm credited</button>
    </form>}
    {error && <p role="alert">{error}</p>}
    <button type="button" className="secondary-button" onClick={()=>void refresh()} disabled={loading||busy!==null}>Refresh credits</button>
    {loading?<p role="status">Loading credits…</p>:claims.length===0?<p>No credit claims to review yet.</p>:
      <div className="nj-credit-claim-list">{claims.map(item=><article className="panel" key={item.id}>
        <strong>{item.releaseRole}</strong> <span>{item.state.replaceAll('_',' ')}</span>
        <small>Release: {item.releaseId} · Slot: {item.contributorSlotId}</small>
        {!administrator&&item.claimantUserId===currentUserId&&item.state==='awaiting_uploader'&&<p>Awaiting the release uploader's decision.</p>}
        {!administrator&&item.uploaderUserId===currentUserId&&item.state==='awaiting_uploader'&&
          <div className="nj-credit-actions">
            {(['confirm','dispute','unsure'] as const).map(decision=><button key={decision} type="button" disabled={busy!==null}
              onClick={()=>void act(item.id,()=>verifiedCreditApi.uploaderResponse(item.id,decision))}>{decision}</button>)}
          </div>}
        {administrator&&<div className="nj-credit-actions">
          {!['rejected','revoked'].includes(item.state)&&<label>Review reason (required for rejection or revocation)<input maxLength={600} value={reviewReasons[item.id]??''} onChange={event=>setReviewReasons(current=>({...current,[item.id]:event.target.value}))} placeholder="Explain the decision" /></label>}
          {item.state==='uploader_confirmed'&&<button type="button" disabled={busy!==null} onClick={()=>void act(item.id,()=>verifiedCreditApi.adminDecision(item.id,'approve'))}>Approve</button>}
          {!['approved','rejected','revoked'].includes(item.state)&&<button type="button" disabled={busy!==null||!reviewReasons[item.id]?.trim()} onClick={()=>void act(item.id,()=>verifiedCreditApi.adminDecision(item.id,'reject',reviewReasons[item.id].trim()))}>Reject</button>}
          {item.state==='approved'&&<button type="button" disabled={busy!==null||!reviewReasons[item.id]?.trim()} onClick={()=>void act(item.id,()=>verifiedCreditApi.adminDecision(item.id,'revoke',reviewReasons[item.id].trim()))}>Revoke</button>}
        </div>}
      </article>)}</div>}
  </section>;
}
