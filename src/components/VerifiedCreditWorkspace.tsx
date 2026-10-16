import { useCallback, useEffect, useState } from 'react';
import { verifiedCreditApi, type CreditClaim } from '../platform/firebase-verified-credits';
import { nightjarCatalogue } from '../platform/firebase-catalogue';

type Props = { currentUserId:string; administrator?: boolean; onNotice?: (message:string)=>void };
export default function VerifiedCreditWorkspace({currentUserId,administrator=false,onNotice}:Props) {
  const [claims,setClaims] = useState<CreditClaim[]>([]);
  const [nextCursor,setNextCursor] = useState<string|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState<string|null>(null);
  const [error,setError] = useState('');
  const [releaseId,setReleaseId] = useState('');
  const [slotId,setSlotId] = useState('');
  const [catalogue,setCatalogue] = useState<Array<{id:string;title:string;contributors?:Array<{slotId?:string;name:string;role:string}>}>>([]);
  const [catalogueLoading,setCatalogueLoading] = useState(false);
  const [reviewReasons,setReviewReasons] = useState<Record<string,string>>({});
  const refresh = useCallback(async()=>{
    setLoading(true);setError('');
    try {
      if (administrator) { const page = await verifiedCreditApi.adminClaims();setClaims(page.claims);setNextCursor(page.nextCursor); }
      else {setClaims(await verifiedCreditApi.myClaims());setNextCursor(null);}
    }
    catch(e) {setError(e instanceof Error?e.message:'Could not load credit claims.');}
    finally {setLoading(false);}
  },[administrator]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    if(administrator) return;
    let active=true;setCatalogueLoading(true);
    void nightjarCatalogue.list().then(result=>{if(active)setCatalogue((result.catalogue??[]).filter((release:any)=>Array.isArray(release.contributors)&&release.contributors.length));})
      .catch(()=>{if(active)setError('Release selection is unavailable. You can still enter a release reference below.');})
      .finally(()=>{if(active)setCatalogueLoading(false);});
    return ()=>{active=false;};
  },[administrator]);
  const loadMore = async () => {
    if (!administrator || !nextCursor || busy) return;
    setBusy('next-page');setError('');
    try {const page = await verifiedCreditApi.adminClaims(nextCursor);
      setClaims(previous=>[...new Map([...previous,...page.claims].map(item=>[item.id,item])).values()]);
      setNextCursor(page.nextCursor);
    } catch(e) {setError(e instanceof Error?e.message:'Could not load more claims.');}
    finally {setBusy(null);}
  };
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
      <label>Find your credited release
        <select value={releaseId} onChange={event=>{setReleaseId(event.target.value);setSlotId('');}}>
          <option value="">{catalogueLoading?'Loading published releases…':'Choose a published release'}</option>
          {catalogue.map(release=><option key={release.id} value={release.id}>{release.title}</option>)}
        </select>
      </label>
      {catalogue.find(release=>release.id===releaseId) && <label>Choose your contribution
        <select value={slotId} required onChange={event=>setSlotId(event.target.value)}>
          <option value="">Select your credited role and name</option>
          {(catalogue.find(release=>release.id===releaseId)?.contributors??[]).map((contributor,index)=><option key={contributor.slotId??String(index)} value={contributor.slotId??String(index)}>{contributor.name} · {contributor.role}</option>)}
        </select>
      </label>}
      {!catalogue.some(release=>release.id===releaseId) && <details><summary>Can't find your release?</summary>
        <label>Release reference <input required maxLength={160} value={releaseId} onChange={event=>setReleaseId(event.target.value)}/></label>
        <label>Contributor reference <input required maxLength={160} value={slotId} onChange={event=>setSlotId(event.target.value)}/></label>
      </details>}
      <button type="submit" disabled={busy!==null||!releaseId.trim()||!slotId.trim()}>Request credit verification</button>
      <small>The release uploader must confirm your contribution before an independent NightJar administrator can approve it. A credit does not grant publishing privileges.</small>
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
      </article>)}{administrator&&nextCursor&&<button type="button" className="secondary-button" disabled={busy!==null} onClick={()=>void loadMore()}>Load more claims</button>}</div>}
  </section>;
}
