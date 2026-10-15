import { useEffect, useState } from 'react';
import { CheckCircle2, CircleHelp, RefreshCw, ShieldCheck } from 'lucide-react';
import { nightjarDiditReuse, type AdminDiditReuse } from '../platform/firebase-didit-reuse';
import { nightjarDiditControlled } from '../platform/firebase-didit-controlled';

type ReviewAction = 'investigating' | 'waiting_for_member' | 'approved_for_reuse' | 'closed';

const reviewStages: Record<AdminDiditReuse['status'], { title: string; explanation: string }> = {
  requested: {
    title: 'Request received · awaiting administrator review',
    explanation: 'The signed-in member has consented to a reuse enquiry. Check their existing Didit record before allowing the secure reuse process.',
  },
  investigating: {
    title: 'Under review · checking previous Didit approval',
    explanation: 'Nightjar is inspecting the old standalone verification. No new ID check is started and the account is not yet verified.',
  },
  waiting_for_member: {
    title: 'Member confirmation required · next step not completed',
    explanation: 'The member must authorise Didit to reuse their identity result and complete provider-controlled ownership confirmation. This status does NOT send a message or open a Didit session automatically.',
  },
  approved_for_reuse: {
    title: 'Reuse request approved · identity still needs linking',
    explanation: 'Nightjar has approved proceeding with Didit reuse. This is NOT 18+ verification. Only a secure account-bound Didit result can grant verified-adult access.',
  },
  closed: {
    title: 'Enquiry closed · no verification change',
    explanation: 'The enquiry was closed without changing the person’s age verification.',
  },
};

export default function AdminDiditReuseRequests() {
  const [requests,setRequests]=useState<AdminDiditReuse[]>([]);
  const [loading,setLoading]=useState(false);
  const [acting,setActing]=useState('');
  const [acknowledged,setAcknowledged]=useState<Record<string,boolean>>({});
  const [authorisedChecks,setAuthorisedChecks]=useState<Record<string,boolean>>({});
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const refresh=async()=>{
    setLoading(true);setError('');
    try{setRequests((await nightjarDiditReuse.adminList()).requests);}
    catch(e){setError(e instanceof Error?e.message:'Nightjar could not load Didit reuse enquiries.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void refresh();},[]);

  const change=async (uid:string,status:ReviewAction)=>{
    if(status==='approved_for_reuse' && !acknowledged[uid])return;
    const confirmation = status==='approved_for_reuse'
      ? 'Approve this MEMBER REQUEST to proceed with a secure Didit reuse flow? This will NOT verify the member, link the old identity report or grant adult content access. Didit must independently confirm ownership and 18+ evidence.'
      : status==='waiting_for_member'
      ? 'Mark that the member needs provider identity-reuse consent and ownership confirmation? This does NOT automatically contact the member or start a check.'
      : status==='investigating'
      ? 'Mark this reuse request as under administrator review? It cannot verify the person or change their age assurance.'
      : 'Close this enquiry without verifying or linking an identity result?';
    if(!window.confirm(confirmation))return;
    setActing(uid);setError('');setNotice('');
    try{
      await nightjarDiditReuse.adminReview(uid,status);
      setNotice(status==='approved_for_reuse'
        ? 'Reuse request approved for further secure provider linking. Member remains unverified until Didit ownership and adult evidence are independently confirmed.'
        : 'Support request updated. No identity verification or Didit session was created.');
      setAcknowledged(current=>({...current,[uid]:false}));
      setRequests((await nightjarDiditReuse.adminList()).requests);
    }catch(e){setError(e instanceof Error?e.message:'Unable to update support request.');}
    finally{setActing('');}
  };
  const authoriseOneLiveCheck=async(uid:string)=>{
    if(!window.confirm('AUTHORISE exactly ONE possible billable live Didit ID verification for this specific member? The member must sign in, explicitly consent and start it themselves. The grant cannot be reissued by tapping again; everyone else remains paused.'))return;
    setActing(uid);setError('');setNotice('');
    try{
      await nightjarDiditControlled.authorise(uid);
      setAuthorisedChecks(prev=>({...prev,[uid]:true}));
      setNotice('One-time live Didit invitation created. The member can sign in to Nightjar → Settings → Verify your identity with Didit. NO provider session has started yet.');
    }catch(error){
      setError(error instanceof Error?error.message:'Could not safely authorise this single member. No provider session was started.');
    }finally{setActing('');}
  };
  const active=requests.filter(x=>x.status!=='closed');
  return <section className="nj-didit-reuse-admin" aria-label="Existing Didit verification reuse requests">
    <div className="nj-didit-reuse-admin-head"><div>
      <span className="mini-label"><ShieldCheck size={15} aria-hidden="true"/> EXISTING DIDIT CHECKS · ACCOUNT LINKING</span>
      <h3>Earlier Didit approvals</h3>
      <p>Review requests from members who completed Didit before signing into Nightjar. An administrator can approve a <strong>reuse request</strong>, but a support review is <strong>not</strong> an identity verification.</p>
      <p>After approval, Didit must still confirm the member owns the original check, consents to reuse and meets the 18+ requirement. The original `getting started` record must not be manually assigned to an account.</p>
    </div><button type="button" className="secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/>{loading?'Loading…':'Refresh requests'}</button></div>

    <details className="nj-didit-reuse-guide">
      <summary><CircleHelp size={16} aria-hidden="true"/> What do the review statuses mean?</summary>
      <dl>
        <dt>Request received</dt><dd>Member requested review; no administrator decision yet.</dd>
        <dt>Under review</dt><dd>Administrator is checking that an existing Didit check exists.</dd>
        <dt>Member confirmation required</dt><dd>The person must confirm identity and consent in Didit’s secure reuse flow. Setting this status does not send them a message.</dd>
        <dt>Reuse request approved</dt><dd>Nightjar approves continuing with secure reuse; not the person’s age. No adult access is granted.</dd>
        <dt>Verified 18+</dt><dd>Separate state available only when Nightjar accepts authenticated Didit age evidence bound to that person’s account.</dd>
      </dl>
    </details>

    {error && <p className="nj-didit-reuse-error" role="alert">{error}</p>}
    {notice && <p className="nj-didit-reuse-message" role="status">{notice}</p>}
    {active.length === 0 && <p>No pending standalone Didit reuse requests. Members can submit one from Settings → Privacy and safety.</p>}
    {active.map(item=><article className="nj-didit-reuse-entry" key={item.uid}>
      <div className="nj-didit-reuse-entry-info">
        <strong>{item.emailMasked||'Member account'}</strong>
        {item.requestedAt && <small>Requested {new Date(item.requestedAt).toLocaleString('en-GB')}</small>}
      </div>
      <div className="nj-didit-reuse-stage" role="status">
        <span className="status-pill muted">{item.status==='approved_for_reuse'?'APPROVED FOR REUSE':item.status==='waiting_for_member'?'MEMBER CONFIRMATION':item.status==='investigating'?'UNDER REVIEW':'NEW REQUEST'}</span>
        <strong>{reviewStages[item.status].title}</strong>
        <p>{reviewStages[item.status].explanation}</p>
      </div>
      {item.status!=='approved_for_reuse' && <div className="nj-didit-reuse-approval">
        <label className="nj-didit-reuse-consent">
          <input type="checkbox" checked={Boolean(acknowledged[item.uid])} disabled={Boolean(acting)} onChange={e=>setAcknowledged(prev=>({...prev,[item.uid]:e.target.checked}))}/>
          <span>I have reviewed the request. <strong>Approval permits the next secure reuse step only.</strong> It does not verify the member, override Didit security, or grant adult access.</span>
        </label>
        <button className="primary-button" type="button" disabled={Boolean(acting)||!acknowledged[item.uid]} onClick={()=>void change(item.uid,'approved_for_reuse')}><ShieldCheck size={16}/> {acting===item.uid?'Saving…':'Approve reuse request'}</button>
      </div>}
      {item.status==='approved_for_reuse' && <p className="nj-didit-reuse-next"><CheckCircle2 size={18}/> <span>Administrator-approved to proceed. <strong>Not verified 18+.</strong> Await Didit’s confirmed identity reuse and account binding.</span></p>}
      {item.status==='approved_for_reuse' && <div className="nj-didit-reuse-approval">
        <strong>Alternative: one normal live ID verification</strong>
        <p>Authorise this member to complete one fresh, account-linked Didit document and liveness check. Their previous standalone approval stays unchanged. Didit may charge Nightjar, and duplicate/fraud warnings remain active.</p>
        <button type="button" className="primary-button"
          disabled={Boolean(acting)||Boolean(authorisedChecks[item.uid])}
          onClick={()=>void authoriseOneLiveCheck(item.uid)}>
          <ShieldCheck size={16}/>{authorisedChecks[item.uid]?'One-time invitation authorised':'Authorise one live ID check'}
        </button>
        <small>Authorising does not start the check. The member must visit Nightjar → Settings and explicitly consent before Didit is contacted.</small>
      </div>}
      <div className="nj-didit-reuse-admin-actions">
        {item.status!=='investigating'&&item.status!=='approved_for_reuse'&&<button className="secondary-button" type="button" disabled={Boolean(acting)} onClick={()=>void change(item.uid,'investigating')}>Mark as under review</button>}
        {item.status!=='waiting_for_member'&&item.status!=='approved_for_reuse'&&<button className="secondary-button" type="button" disabled={Boolean(acting)} onClick={()=>void change(item.uid,'waiting_for_member')}>Member confirmation needed</button>}
        <button className="secondary-button" type="button" disabled={Boolean(acting)} onClick={()=>void change(item.uid,'closed')}>Close enquiry</button>
      </div>
    </article>)}
    <small>These administrative actions update the consented support request only. They cannot verify an identity, link an old Didit record, replay a webhook or start an ID session. No automated member message is sent.</small>
  </section>;
}
