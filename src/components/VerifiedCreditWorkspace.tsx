import { useCallback, useEffect, useState } from 'react';
import { verifiedCreditApi, type CreditClaim } from '../platform/firebase-verified-credits';
import { nightjarCatalogue } from '../platform/firebase-catalogue';

type Props = { currentUserId:string; administrator?: boolean; focusedClaimId?:string|null; onNotice?: (message:string)=>void };
export default function VerifiedCreditWorkspace({currentUserId,administrator=false,focusedClaimId=null,onNotice}:Props) {
  const [claims,setClaims] = useState<CreditClaim[]>([]);
  const [nextCursor,setNextCursor] = useState<string|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState<string|null>(null);
  const [error,setError] = useState('');
  const [releaseId,setReleaseId] = useState('');
  const [slotId,setSlotId] = useState('');
  const [inviteReleaseId,setInviteReleaseId] = useState('');
  const [inviteSlotId,setInviteSlotId] = useState('');
  const [inviteUserId,setInviteUserId] = useState('');
  const [catalogue,setCatalogue] = useState<Array<{id:string;title:string;contributors?:Array<{slotId?:string;name:string;role:string}>}>>([]);
  const [catalogueLoading,setCatalogueLoading] = useState(false);
  const [reviewReasons,setReviewReasons] = useState<Record<string,string>>({});
  const [appealReasons,setAppealReasons] = useState<Record<string,string>>({});
  const refresh = useCallback(async()=>{
    setLoading(true);setError('');
    try {
      const [page, selected] = await Promise.all([
        administrator ? verifiedCreditApi.adminClaims() : verifiedCreditApi.myClaims(),
        focusedClaimId ? verifiedCreditApi.getClaim(focusedClaimId).catch(()=>null) : Promise.resolve(null),
      ]);
      const focused = selected?.claim;
      setClaims(focused ? [focused,...page.claims.filter(item=>item.id!==focused.id)] : page.claims);
      setNextCursor(page.nextCursor);
    }
    catch(e) {setError(e instanceof Error?e.message:'Could not load credit claims.');}
    finally {setLoading(false);}
  },[administrator,focusedClaimId]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    if (focusedClaimId && claims.some(item=>item.id===focusedClaimId)) {
      document.getElementById('nj-credit-' + focusedClaimId)?.scrollIntoView({block:'center'});
    }
  },[claims,focusedClaimId]);
  useEffect(()=>{
    if(administrator) return;
    let active=true;setCatalogueLoading(true);
    void nightjarCatalogue.list().then(result=>{if(active)setCatalogue((result.catalogue??[]).filter((release:any)=>Array.isArray(release.contributors)&&release.contributors.length));})
      .catch(()=>{if(active)setError('Release selection is unavailable. You can still enter a release reference below.');})
      .finally(()=>{if(active)setCatalogueLoading(false);});
    return ()=>{active=false;};
  },[administrator]);
  const loadMore = async () => {
    if (!nextCursor || busy) return;
    setBusy('next-page');setError('');
    try {const page = await (administrator ? verifiedCreditApi.adminClaims(nextCursor) : verifiedCreditApi.myClaims(nextCursor));
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
    {!administrator && <details className="nj-credit-invitations"><summary>Invite a credited contributor (release uploader)</summary>
      <form onSubmit={event=>{event.preventDefault();void act('invite',()=>verifiedCreditApi.invite(inviteReleaseId.trim(),inviteSlotId.trim(),inviteUserId.trim()).then(()=>{setInviteReleaseId('');setInviteSlotId('');setInviteUserId('');}));}}>
        <label>Published release reference<input required maxLength={160} value={inviteReleaseId} onChange={event=>setInviteReleaseId(event.target.value)} /></label>
        <label>Contributor slot reference<input required maxLength={160} value={inviteSlotId} onChange={event=>setInviteSlotId(event.target.value)} /></label>
        <label>NightJar member account ID<input required maxLength={160} value={inviteUserId} onChange={event=>setInviteUserId(event.target.value)} /></label>
        <button type="submit" disabled={busy!==null}>Send credit invitation</button>
        <small>Only the release uploader can invite a member. The invited member must accept before an independent administrator can approve the credit.</small>
      </form>
    </details>}
    {error && <p role="alert">{error}</p>}
    <button type="button" className="secondary-button" onClick={()=>void refresh()} disabled={loading||busy!==null}>Refresh credits</button>
    {loading?<p role="status">Loading credits…</p>:claims.length===0?<p>No credit claims to review yet.</p>:
      <div className="nj-credit-claim-list">{claims.map(item=><article id={"nj-credit-" + item.id} data-focused={focusedClaimId===item.id?"true":undefined} className="panel" key={item.id}>
        <strong>{item.releaseRole}</strong> <span>{item.state.replaceAll('_',' ')}</span>
        <small>Release: {item.releaseId} · Slot: {item.contributorSlotId}</small>
        {!administrator&&item.claimantUserId===currentUserId&&item.state==='awaiting_member'&&
          <div className="nj-credit-actions"><p>The release uploader has invited you to claim this credit.</p>
            <button type="button" disabled={busy!==null} onClick={()=>void act(item.id,()=>verifiedCreditApi.invitationResponse(item.id,'accept'))}>Accept credit invitation</button>
            <button type="button" disabled={busy!==null} onClick={()=>void act(item.id,()=>verifiedCreditApi.invitationResponse(item.id,'decline'))}>Decline</button>
          </div>}
        {!administrator&&item.claimantUserId===currentUserId&&item.state==='awaiting_uploader'&&<p>Awaiting the release uploader's decision.</p>}
        {!administrator&&item.claimantUserId===currentUserId&&['rejected','revoked'].includes(item.state)&&
          (item.appealPending ? <p>Appeal submitted for independent review.</p> :
            <div className="nj-credit-actions"><label>Request a credit decision review
              <input maxLength={600} value={appealReasons[item.id]??''} onChange={event=>setAppealReasons(current=>({...current,[item.id]:event.target.value}))} placeholder="Explain the correction or supporting evidence" />
            </label><button type="button" disabled={busy!==null||(appealReasons[item.id]?.trim().length??0)<10} onClick={()=>void act(item.id,()=>verifiedCreditApi.appeal(item.id,appealReasons[item.id].trim()))}>Submit appeal</button></div>)}
        {administrator&&item.appealPending&&<p role="status">Member appeal awaiting independent review.</p>}
        {!administrator&&item.uploaderUserId===currentUserId&&item.state==='awaiting_uploader'&&
          <div className="nj-credit-actions">
            {(['confirm','dispute','unsure'] as const).map(decision=><button key={decision} type="button" disabled={busy!==null}
              onClick={()=>void act(item.id,()=>verifiedCreditApi.uploaderResponse(item.id,decision))}>{decision}</button>)}
          </div>}
        {administrator&&<div className="nj-credit-actions">
          {!['rejected','revoked'].includes(item.state)&&<label>Review reason (required for rejection or revocation)<input maxLength={600} value={reviewReasons[item.id]??''} onChange={event=>setReviewReasons(current=>({...current,[item.id]:event.target.value}))} placeholder="Explain the decision" /></label>}
          {item.appealPending&&<button type="button" disabled={busy!==null||!reviewReasons[item.id]?.trim()} onClick={()=>void act(item.id,()=>verifiedCreditApi.adminDecision(item.id,'resolve_appeal',reviewReasons[item.id].trim()))}>Resolve appeal with reason</button>}
          {item.state==='uploader_confirmed'&&<button type="button" disabled={busy!==null} onClick={()=>void act(item.id,()=>verifiedCreditApi.adminDecision(item.id,'approve'))}>Approve</button>}
          {!['approved','rejected','revoked'].includes(item.state)&&<button type="button" disabled={busy!==null||!reviewReasons[item.id]?.trim()} onClick={()=>void act(item.id,()=>verifiedCreditApi.adminDecision(item.id,'reject',reviewReasons[item.id].trim()))}>Reject</button>}
          {item.state==='approved'&&<button type="button" disabled={busy!==null||!reviewReasons[item.id]?.trim()} onClick={()=>void act(item.id,()=>verifiedCreditApi.adminDecision(item.id,'revoke',reviewReasons[item.id].trim()))}>Revoke</button>}
        </div>}
      </article>)}{nextCursor&&<button type="button" className="secondary-button" disabled={busy!==null} onClick={()=>void loadMore()}>Load more claims</button>}</div>}
  </section>;
}
