import { useCallback, useEffect, useState } from 'react';
import { verifiedCreditApi, type CreditClaim } from '../platform/firebase-verified-credits';
import { nightjarCatalogue } from '../platform/firebase-catalogue';
import { nightjarCommunity } from '../platform/firebase-community';
import './verified-credit-workspace.css';

type PublicMember = {userId:string;displayName?:string;name?:string;handle?:string;role?:string};
type ReleaseOption = {id:string;title:string;creatorUserId?:string;contributors?:Array<{slotId?:string;name:string;role:string}>};
type Props = { currentUserId:string; administrator?: boolean; focusedClaimId?:string|null; onNotice?: (message:string)=>void };
export default function VerifiedCreditWorkspace({currentUserId,administrator=false,focusedClaimId=null,onNotice}:Props) {
  const [claims,setClaims] = useState<CreditClaim[]>([]);
  const [nextCursor,setNextCursor] = useState<string|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState<string|null>(null);
  const [error,setError] = useState('');
  const [releaseId,setReleaseId] = useState(()=>{
    const query=new URLSearchParams(window.location.search);
    const id=query.get('creditRelease')??'';
    return /^[A-Za-z0-9_-]{1,160}$/.test(id)?id:'';
  });
  const [slotId,setSlotId] = useState(()=>{
    const query=new URLSearchParams(window.location.search);
    const id=query.get('creditSlot')??'';
    return /^[A-Za-z0-9_-]{1,160}$/.test(id)?id:'';
  });
  const [inviteReleaseId,setInviteReleaseId] = useState('');
  const [inviteSlotId,setInviteSlotId] = useState('');
  const [inviteUserId,setInviteUserId] = useState('');
  const [catalogue,setCatalogue] = useState<ReleaseOption[]>([]);
  const [claimManual,setClaimManual] = useState(false);
  const [inviteManual,setInviteManual] = useState(false);
  const [showInvite,setShowInvite] = useState(false);
  const [people,setPeople] = useState<PublicMember[]>([]);
  const [peopleLoading,setPeopleLoading] = useState(false);
  const [peopleError,setPeopleError] = useState('');
  const [memberQuery,setMemberQuery] = useState('');
  const [inviteMemberManual,setInviteMemberManual] = useState(false);
  const [success,setSuccess] = useState('');
  const [shareExternalOpen,setShareExternalOpen] = useState(false);
  const [externalCopyStatus,setExternalCopyStatus] = useState('');
  const [externalClaimLink] = useState(()=>{
    const query = new URLSearchParams(window.location.search);
    const release=query.get('creditRelease')??'',slot=query.get('creditSlot')??'';
    return /^[A-Za-z0-9_-]{1,160}$/.test(release) && /^[A-Za-z0-9_-]{1,160}$/.test(slot)
      ? {release,slot} : null;
  });
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
  useEffect(()=>{
    if(administrator||!showInvite) return;
    let active=true;
    setPeopleLoading(true);setPeopleError('');
    void nightjarCommunity.listPublicProfiles().then(result=>{
      if(active) setPeople((result.profiles??[]).filter((member:PublicMember)=>
        typeof member.userId==='string'&&member.userId!==currentUserId));
    }).catch(()=>{if(active)setPeopleError('The member directory is unavailable. You can use a member account ID instead.');})
      .finally(()=>{if(active)setPeopleLoading(false);});
    return ()=>{active=false;};
  },[administrator,showInvite,currentUserId]);
  const chosenRelease = catalogue.find(release=>release.id===releaseId);
  // A valid link can arrive before catalogue loads; old release references
  // remain editable, but we never silently submit or approve the claim.
  useEffect(()=>{
    if(!externalClaimLink||catalogueLoading) return;
    if(!catalogue.some(item=>item.id===externalClaimLink.release)) setClaimManual(true);
  },[catalogue,catalogueLoading,externalClaimLink]);
  const ownedReleases = catalogue.filter(release=>!release.creatorUserId||release.creatorUserId===currentUserId);
  const invitationRelease = ownedReleases.find(release=>release.id===inviteReleaseId);
  const matchingPeople = memberQuery.trim().length < 2 ? [] : people.filter(member=>
    [member.displayName,member.name,member.handle].some(value=>String(value??'').toLowerCase().includes(memberQuery.trim().toLowerCase()))).slice(0,25);
  const claimComplete = Boolean(releaseId.trim()&&slotId.trim());
  const inviteComplete = Boolean(inviteReleaseId.trim()&&inviteSlotId.trim()&&inviteUserId.trim());
  // An external invitation is a public signup-and-claim deep link, not a
  // verified identity or a bearer credential. No backend account or claims
  // are created merely by generating/copying/sharing this link.
  const offPlatformLink = inviteReleaseId.trim()&&inviteSlotId.trim()
    ? 'https://nightjar-audio.web.app/profile/credits?creditRelease='+
      encodeURIComponent(inviteReleaseId.trim())+'&creditSlot='+encodeURIComponent(inviteSlotId.trim())
    : '';
  const copyOffPlatformLink = async () => {
    if(!offPlatformLink)return;
    try {
      await navigator.clipboard.writeText(offPlatformLink);
      setExternalCopyStatus('Invitation link copied. Share it privately with the contributor.');
    } catch {
      setExternalCopyStatus('Select and copy the link from the field below.');
    }
  };
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
    setBusy(id);setError('');setSuccess('');
    try {await fn();setSuccess('Your request was saved. Refresh or open your notification to see its current status.');onNotice?.('Credit claim updated.');await refresh();}
    catch(e) {setError(e instanceof Error?e.message:'Could not update claim.');}
    finally {setBusy(null);}
  };
  const claimInstructions = [
    ['4. Credit claim','As a verified member, choose a published release and your credited name/role, then send a request.'],
    ['5. Uploader invitation','The uploader selects their own release and slot, chooses a different member, and sends an invitation.'],
    ['6. Confirmation','The member accepts; the uploader responds to an independent member claim with Confirm, Dispute or Unsure.'],
    ['7. Admin review','A third, independent administrator reviews the confirmed request; the claimant and uploader cannot approve themselves.'],
    ['8. Appeal and revoke','Reject one test claim with a reason, submit a member appeal, resolve it; separately revoke a previously approved credit.'],
    ['10. Credited Listener','Check the public profile after a genuine approved listener credit. It must show credited work but never a professional moon badge.'],
  ] as const;
  return <section className="nj-verified-credits" aria-label={administrator?'Credit review queue':'Your release credits'}>
    <header className="nj-credit-heading">
      <span className="mini-label">RELEASE ATTRIBUTION</span>
      <h2>{administrator?'Review contributor credits':'Your release credits'}</h2>
      <p>Every credit requires agreement from the people involved and an independent NightJar review. Being credited never grants creator privileges or the official gold moon.</p>
    </header>
    {administrator && <details className="nj-credit-guide">
      <summary>How to test the 6 outstanding credit features <span className="nj-credit-chevron" aria-hidden="true"/></summary>
      <div className="nj-credit-guide-body">
        <p><strong>Real-account acceptance, not a simulation.</strong> Use consenting, already-verified test accounts and a controlled release. Nothing in this guide automatically creates a claim, bypasses Didit or changes account roles. Don't approve a fabricated contribution to someone else's actual release.</p>
        <ol>{claimInstructions.map(([title,description])=><li key={title}><strong>{title}</strong><span>{description}</span></li>)}</ol>
        <p className="nj-credit-helper">Mark checks 4–8 and 10 as PASS only after you witness the corresponding account-to-account result, not simply because a button is visible.</p>
      </div>
    </details>}
    {!administrator && externalClaimLink && <div className="nj-credit-feedback nj-credit-invite-arrived" role="status">
      <strong>You've received a contributor invitation link.</strong>
      <p>Check that the release and contribution below are genuinely yours. You must sign in, complete NightJar's normal 18+ verification, and <strong>request</strong> a credit. The uploader and an independent administrator must approve it. This link grants no role or gold moon.</p>
    </div>}
    {!administrator && <section className="nj-credit-card" aria-labelledby="nj-credit-request-title">
      <div className="nj-credit-card-head"><span className="nj-credit-step">01</span><div><h3 id="nj-credit-request-title">Claim a release credit</h3><p>Find a published release and select the credit showing your name and contribution.</p></div></div>
      <form className="nj-credit-form" onSubmit={event=>{
        event.preventDefault();
        if(!claimComplete)return;
        void act('new',()=>verifiedCreditApi.claim(releaseId.trim(),slotId.trim()).then(()=>{setReleaseId('');setSlotId('');}));
      }}>
        {!claimManual ? <div className="nj-credit-fields">
          <label htmlFor="nj-credit-release">Published release <span className="nj-credit-required">*</span></label>
          <div className="nj-credit-select-wrap"><select id="nj-credit-release" required value={releaseId} onChange={event=>{setReleaseId(event.target.value);setSlotId('');}}>
            <option value="">{catalogueLoading?'Loading published releases…':'Choose a published release ↓'}</option>
            {catalogue.map(release=><option key={release.id} value={release.id}>{release.title}</option>)}
          </select></div>
          <label htmlFor="nj-credit-slot">Your credited name and role <span className="nj-credit-required">*</span></label>
          <div className="nj-credit-select-wrap"><select id="nj-credit-slot" required disabled={!chosenRelease} value={slotId} onChange={event=>setSlotId(event.target.value)}>
            <option value="">{chosenRelease?'Choose your credited contribution ↓':'Choose a release first'}</option>
            {(chosenRelease?.contributors??[]).map((person,index)=><option key={person.slotId??String(index)} value={person.slotId??String(index)}>{person.name} · {person.role}</option>)}
          </select></div>
          {chosenRelease && !chosenRelease.contributors?.length && <p className="nj-credit-helper">No contributor entries are available for this release.</p>}
        </div>:<div className="nj-credit-fields">
          <label htmlFor="nj-credit-reference">Release reference <span className="nj-credit-required">*</span></label>
          <input id="nj-credit-reference" required maxLength={160} value={releaseId} placeholder="Published release ID" onChange={event=>setReleaseId(event.target.value)}/>
          <label htmlFor="nj-credit-slot-reference">Contributor slot reference <span className="nj-credit-required">*</span></label>
          <input id="nj-credit-slot-reference" required maxLength={160} value={slotId} placeholder="Slot ID from the release" onChange={event=>setSlotId(event.target.value)}/>
          <p className="nj-credit-helper">Use this only for a legacy release that does not appear in the list. Enter the exact release and slot references.</p>
        </div>}
        <button type="button" className="nj-credit-switch" aria-pressed={claimManual} onClick={()=>{setClaimManual(v=>!v);setReleaseId('');setSlotId('');}}>{claimManual?'← Back to release dropdowns':"Can't find your release? Enter references instead"}</button>
        <button className="nj-credit-primary" type="submit" disabled={busy!==null||!claimComplete}>{busy==='new'?'Sending request…':'Request credit verification'}</button>
        <p className="nj-credit-helper">Next: the uploader confirms your work, then an independent administrator reviews it.</p>
      </form>
    </section>}
    {!administrator && <section className="nj-credit-card" aria-labelledby="nj-credit-invite-title">
      <div className="nj-credit-card-head"><span className="nj-credit-step">02</span><div><h3 id="nj-credit-invite-title">Invite a contributor</h3><p>For the uploader of a published release. The invited member must accept before approval.</p></div></div>
      <button type="button" className="nj-credit-expand" aria-expanded={showInvite} aria-controls="nj-credit-invite-fields" onClick={()=>setShowInvite(v=>!v)}>
        {showInvite?'Hide invitation form':'Open invitation form'} <span className="nj-credit-chevron" aria-hidden="true"/>
      </button>
      {showInvite && <form id="nj-credit-invite-fields" className="nj-credit-form" onSubmit={event=>{
        event.preventDefault();if(!inviteComplete)return;
        void act('invite',()=>verifiedCreditApi.invite(inviteReleaseId.trim(),inviteSlotId.trim(),inviteUserId.trim()).then(()=>{
          setInviteReleaseId('');setInviteSlotId('');setInviteUserId('');setMemberQuery('');
        }));
      }}>
        {!inviteManual?<div className="nj-credit-fields">
          <label htmlFor="nj-invite-release">Your published release <span className="nj-credit-required">*</span></label>
          <div className="nj-credit-select-wrap"><select id="nj-invite-release" required value={inviteReleaseId} onChange={event=>{setInviteReleaseId(event.target.value);setInviteSlotId('');}}>
            <option value="">{catalogueLoading?'Loading releases…':'Select the release you uploaded ↓'}</option>
            {ownedReleases.map(release=><option key={release.id} value={release.id}>{release.title}</option>)}
          </select></div>
          <label htmlFor="nj-invite-slot">Contribution to invite for <span className="nj-credit-required">*</span></label>
          <div className="nj-credit-select-wrap"><select id="nj-invite-slot" required disabled={!invitationRelease} value={inviteSlotId} onChange={event=>setInviteSlotId(event.target.value)}>
            <option value="">{invitationRelease?'Choose contributor name and role ↓':'Choose a release first'}</option>
            {(invitationRelease?.contributors??[]).map((person,index)=><option key={person.slotId??String(index)} value={person.slotId??String(index)}>{person.name} · {person.role}</option>)}
          </select></div>
        </div>:<div className="nj-credit-fields">
          <label htmlFor="nj-invite-release-id">Release reference</label><input id="nj-invite-release-id" required maxLength={160} value={inviteReleaseId} onChange={event=>setInviteReleaseId(event.target.value)}/>
          <label htmlFor="nj-invite-slot-id">Contributor slot reference</label><input id="nj-invite-slot-id" required maxLength={160} value={inviteSlotId} onChange={event=>setInviteSlotId(event.target.value)}/>
        </div>}
        <button type="button" className="nj-credit-switch" aria-pressed={inviteManual} onClick={()=>{setInviteManual(v=>!v);setInviteReleaseId('');setInviteSlotId('');}}>{inviteManual?'← Back to release dropdowns':'Legacy release? Enter references manually'}</button>
        <div className="nj-credit-fields">
          <label htmlFor="nj-invite-member-search">Find the NightJar member <span className="nj-credit-required">*</span></label>
          {!inviteMemberManual ? <>
            <input id="nj-invite-member-search" value={memberQuery} onChange={event=>{setMemberQuery(event.target.value);setInviteUserId('');}} placeholder="Search their display name or @handle" autoComplete="off"/>
            {peopleLoading&&<p className="nj-credit-helper" role="status">Loading member directory…</p>}
            {peopleError&&<p role="alert" className="nj-credit-helper">{peopleError}</p>}
            {matchingPeople.length>0 && <div className="nj-credit-member-results" role="group" aria-label="Matching NightJar accounts">
              {matchingPeople.map(member=><button type="button" key={member.userId} aria-pressed={inviteUserId===member.userId} onClick={()=>{setInviteUserId(member.userId);setMemberQuery(member.displayName||member.name||member.handle||'Selected member');}}>
                <strong>{member.displayName||member.name||member.handle||'NightJar member'}</strong><small>{member.handle?'@'+member.handle.replace(/^@/,''):'Public profile'}</small>
              </button>)}
            </div>}
            {inviteUserId&&<p className="nj-credit-chosen" role="status">✓ Member selected — ready to invite</p>}
            {!inviteUserId&&memberQuery.trim().length>=2&&!peopleLoading&&matchingPeople.length===0&&<p className="nj-credit-helper">No matching public member found. Try their handle or use an account ID.</p>}
          </>:<input id="nj-invite-member-search" required maxLength={160} value={inviteUserId} onChange={event=>setInviteUserId(event.target.value)} placeholder="Paste the exact NightJar user ID"/>}
          <button type="button" className="nj-credit-switch" aria-pressed={inviteMemberManual} onClick={()=>{setInviteMemberManual(v=>!v);setInviteUserId('');setMemberQuery('');}}>{inviteMemberManual?'← Search member directory':'Have their account ID? Enter it instead'}</button>
        </div>
        <button type="submit" className="nj-credit-primary" disabled={busy!==null||!inviteComplete}>{busy==='invite'?'Sending invitation…':'Send credit invitation'}</button>
        <p className="nj-credit-helper">Only the release uploader can invite. The member must explicitly accept. An independent NightJar administrator makes the final decision.</p>
      </form>}
      <div className="nj-credit-outside-invite">
        <div>
          <strong>Contributor not on NightJar?</strong>
          <p>Share an invitation to join as a member and claim this specific credit. They do not become an official NightJar Creator, Writer, Editor or Artist through the invitation.</p>
        </div>
        <button type="button" className="nj-credit-expand" aria-expanded={shareExternalOpen} aria-controls="nj-credit-share-outside" onClick={()=>{setShareExternalOpen(v=>!v);setShowInvite(true);}}>
          {shareExternalOpen?'Hide off-platform invitation':'Invite someone outside NightJar'} <span className="nj-credit-chevron" aria-hidden="true"/>
        </button>
        {shareExternalOpen && <div id="nj-credit-share-outside" className="nj-credit-form">
          <p className="nj-credit-helper">First select <strong>your published release and contribution</strong> in the invitation form above. You do not need their NightJar account ID or their email address.</p>
          <label htmlFor="nj-credit-share-link">Private invitation link</label>
          <input id="nj-credit-share-link" readOnly value={offPlatformLink} placeholder="Choose a release and contribution above to generate a link" onFocus={event=>event.currentTarget.select()} aria-describedby="nj-credit-share-explainer"/>
          <button type="button" className="nj-credit-primary" disabled={!offPlatformLink} onClick={()=>void copyOffPlatformLink()}>Copy invitation link</button>
          {externalCopyStatus&&<p role="status" className="nj-credit-chosen">{externalCopyStatus}</p>}
          <p id="nj-credit-share-explainer" className="nj-credit-helper">No email is sent automatically. Share the link yourself. It does not reserve the credit, bypass beta access/Didit, approve attribution or award the official gold moon. Once the invited adult joins and verifies, they can request the credit, which still requires your confirmation and independent admin approval.</p>
        </div>}
      </div>
    </section>}
    {error&&<p role="alert" className="nj-credit-feedback nj-credit-error">{error}</p>}
    {success&&<p role="status" className="nj-credit-feedback nj-credit-success">{success}</p>}
    <section className="nj-credit-card nj-credit-history" aria-labelledby="nj-credit-history-title">
      <div className="nj-credit-card-head"><span className="nj-credit-step">{administrator?'01':'03'}</span><div><h3 id="nj-credit-history-title">{administrator?'Review pending and historical claims':'Your credit requests and invitations'}</h3>
        <p>{administrator?'Use the actions on each claim to accept, reject, revoke or resolve a dispute.':'Follow every request here. The next available action appears when a response is required.'}</p></div></div>
      <button type="button" className="nj-credit-refresh" onClick={()=>void refresh()} disabled={loading||busy!==null}>↻ Refresh requests</button>
      {loading?<p role="status" className="nj-credit-empty">Loading credit requests…</p>:claims.length===0?<div className="nj-credit-empty"><strong>Nothing waiting yet.</strong><p>{administrator?'New and appealed credit requests will appear here.':'Use “Claim a release credit” or accept an invitation to begin.'}</p></div>:
        <div className="nj-credit-claim-list">{claims.map(item=><article id={'nj-credit-'+item.id} data-focused={focusedClaimId===item.id?'true':undefined} className="nj-credit-claim" key={item.id}>
          <div className="nj-credit-claim-top"><strong>{item.releaseRole}</strong><span className="nj-credit-state">{item.state.replaceAll('_',' ')}</span></div>
          <small className="nj-credit-claim-ref">Release: {item.releaseId} · Slot: {item.contributorSlotId}</small>
          {!administrator&&item.claimantUserId===currentUserId&&item.state==='awaiting_member'&&<div className="nj-credit-actions">
            <p>An uploader has invited you to be credited. Accept only if this is your genuine contribution.</p>
            <button type="button" disabled={busy!==null} onClick={()=>void act(item.id,()=>verifiedCreditApi.invitationResponse(item.id,'accept'))}>Accept credit invitation</button>
            <button type="button" className="nj-credit-danger" disabled={busy!==null} onClick={()=>void act(item.id,()=>verifiedCreditApi.invitationResponse(item.id,'decline'))}>Decline invitation</button>
          </div>}
          {!administrator&&item.claimantUserId===currentUserId&&item.state==='awaiting_uploader'&&<p className="nj-credit-helper">Waiting for the release uploader to respond.</p>}
          {!administrator&&item.claimantUserId===currentUserId&&['rejected','revoked'].includes(item.state)&&(
            item.appealPending?<p className="nj-credit-chosen">Appeal sent for independent review.</p>:
              <div className="nj-credit-actions nj-credit-fields">
                <label htmlFor={'nj-credit-appeal-'+item.id}>Reason for appeal</label>
                <textarea id={'nj-credit-appeal-'+item.id} maxLength={600} value={appealReasons[item.id]??''} onChange={event=>setAppealReasons(prev=>({...prev,[item.id]:event.target.value}))} placeholder="Describe what should be corrected and your evidence" rows={3}/>
                <button type="button" disabled={busy!==null||(appealReasons[item.id]?.trim().length??0)<10} onClick={()=>void act(item.id,()=>verifiedCreditApi.appeal(item.id,(appealReasons[item.id]??'').trim()))}>Request independent review</button>
              </div>)}
          {!administrator&&item.uploaderUserId===currentUserId&&item.state==='awaiting_uploader'&&<div className="nj-credit-actions">
            <p>A member has claimed a credit on your release. How do you respond?</p>
            {(['confirm','dispute','unsure'] as const).map(decision=><button key={decision} type="button" disabled={busy!==null} onClick={()=>void act(item.id,()=>verifiedCreditApi.uploaderResponse(item.id,decision))}>{decision==='confirm'?'Confirm contribution':decision==='dispute'?'Dispute claim':'Not sure yet'}</button>)}
          </div>}
          {administrator&&<div className="nj-credit-actions nj-credit-fields">
            {item.appealPending&&<p role="status" className="nj-credit-chosen">Member appeal waiting for review</p>}
            <label htmlFor={'nj-credit-review-'+item.id}>Decision reason <span className="nj-credit-optional">(required for rejecting, revoking or resolving an appeal)</span></label>
            <textarea id={'nj-credit-review-'+item.id} maxLength={600} rows={2} value={reviewReasons[item.id]??''} onChange={event=>setReviewReasons(prev=>({...prev,[item.id]:event.target.value}))} placeholder="Record the evidence and why this decision is appropriate"/>
            {item.appealPending&&<button type="button" disabled={busy!==null||!reviewReasons[item.id]?.trim()} onClick={()=>void act(item.id,()=>verifiedCreditApi.adminDecision(item.id,'resolve_appeal',(reviewReasons[item.id]??'').trim()))}>Resolve appeal with reason</button>}
            {item.state==='uploader_confirmed'&&<button type="button" disabled={busy!==null||[item.claimantUserId,item.uploaderUserId].includes(currentUserId)} onClick={()=>void act(item.id,()=>verifiedCreditApi.adminDecision(item.id,'approve'))}>Approve verified credit</button>}
            {!['approved','rejected','revoked'].includes(item.state)&&<button type="button" className="nj-credit-danger" disabled={busy!==null||!reviewReasons[item.id]?.trim()||[item.claimantUserId,item.uploaderUserId].includes(currentUserId)} onClick={()=>void act(item.id,()=>verifiedCreditApi.adminDecision(item.id,'reject',(reviewReasons[item.id]??'').trim()))}>Reject with reason</button>}
            {item.state==='approved'&&<button type="button" className="nj-credit-danger" disabled={busy!==null||!reviewReasons[item.id]?.trim()||[item.claimantUserId,item.uploaderUserId].includes(currentUserId)} onClick={()=>void act(item.id,()=>verifiedCreditApi.adminDecision(item.id,'revoke',(reviewReasons[item.id]??'').trim()))}>Revoke verified credit</button>}
            {[item.claimantUserId,item.uploaderUserId].includes(currentUserId)&&<p className="nj-credit-helper">Independent review required: this administrator is part of the claim.</p>}
          </div>}
        </article>)}{nextCursor&&<button type="button" className="nj-credit-refresh" disabled={busy!==null} onClick={()=>void loadMore()}>Load more credit requests</button>}</div>}
    </section>
  </section>;
}
