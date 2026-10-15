import { useEffect,useState } from 'react';
import { LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { nightjarDiditReuse, type AdminDiditReuse } from '../platform/firebase-didit-reuse';
import { nightjarSingleDiditPilot, type DiditSinglePilotAdminStatus } from '../platform/firebase-didit-member-pilot';

export default function AdminDiditSingleMemberPilot() {
  const [approvals,setApprovals]=useState<AdminDiditReuse[]>([]);
  const [state,setState]=useState<DiditSinglePilotAdminStatus|null>(null);
  const [uid,setUid]=useState('');
  const [checked,setChecked]=useState(false);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const refresh=async()=>{
    setWorking(true);setError('');
    try{
      const [status,queue]=await Promise.all([nightjarSingleDiditPilot.adminStatus(),nightjarDiditReuse.adminList()]);
      setState(status);
      setApprovals(queue.requests.filter(item=>item.status==='approved_for_reuse'));
    }catch(e){setError(e instanceof Error?e.message:'Unable to retrieve the maintenance pilot and approved requests.');}
    finally{setWorking(false);}
  };
  useEffect(()=>{void refresh();},[]);
  const authorise=async()=>{
    if(!checked||!uid||working||state?.status!=='unused')return;
    if(!window.confirm('AUTHORISE ONE POSSIBLY CHARGEABLE LIVE ID CHECK FOR THIS ACCOUNT? Nightjar will NOT start the check. The member must consent and press Start from their own login. This authorisation cannot be transferred or renewed automatically.'))return;
    setWorking(true);setMessage('');setError('');
    try{
      const result=await nightjarSingleDiditPilot.adminAuthorise(uid);
      setMessage('Authorised for '+result.memberEmailMasked+'. The member can now sign into Nightjar → Settings → Verify your Nightjar account once. No Didit session has started yet.');
      setChecked(false);
      setState(await nightjarSingleDiditPilot.adminStatus());
    }catch(e){setError(e instanceof Error?e.message:'Unable to authorise the controlled check. No new session was started.');}
    finally{setWorking(false);}
  };
  return <section className="nj-didit-reuse-admin nj-didit-normal-admin" aria-label="One-time member normal Didit verification">
    <div className="nj-didit-reuse-admin-head"><div>
      <span className="mini-label"><LockKeyhole size={15} aria-hidden="true"/> DIDIT · SINGLE ACCOUNT TEST</span>
      <h3>One normal ID verification, linked to Nightjar</h3>
      <p>Instead of reusing an old standalone check, authorise one ordinary Didit ID and selfie session for a member already in the approved reuse queue. Other members remain blocked while maintenance is active.</p>
    </div><button className="secondary-button" type="button" disabled={working} onClick={()=>void refresh()}><RefreshCw size={15}/>{working?'Checking…':'Refresh pilot'}</button></div>
    {state?.status==='unused'?<>
      <label htmlFor="nj-one-check-member">Member to authorise</label>
      <select className="nj-didit-pilot-select" id="nj-one-check-member" value={uid} onChange={e=>{setUid(e.target.value);setChecked(false);}}>
        <option value="">Select the approved Nightjar account</option>
        {approvals.map(item=><option key={item.uid} value={item.uid}>{item.emailMasked} · existing request approved</option>)}
      </select>
      <label className="nj-didit-reuse-consent">
        <input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} disabled={!uid||working}/>
        <span>I authorise <strong>one real live Didit check</strong> for this member's own account. It may incur a charge. The member must separately consent; no automatic start or retry is permitted. This does not verify them.</span>
      </label>
      <button className="primary-button" type="button" disabled={!uid||!checked||working} onClick={()=>void authorise()}>
        <ShieldCheck size={16}/> Authorise one normal ID check
      </button>
      {approvals.length===0&&<p>There are no consented approved requests eligible for a controlled normal ID test.</p>}
    </>:state?.status==='authorised'?
      <div className="nj-didit-reuse-stage" role="status"><strong>One-use invitation authorised</strong><p>Waiting for the selected member to explicitly start their own check from Settings. No Didit session has been created by this approval. The invitation expires 48 hours after authorisation.</p></div>
      :state?.status==='claimed'?
        <div className="nj-didit-reuse-stage" role="status"><strong>One permitted check already claimed</strong><p>The member has requested their one-time live verification. They must complete the existing session or contact Nightjar if it failed. Do not issue a second paid session.</p></div>
        :<p>Checking the existing maintenance authorisation…</p>}
    {error&&<p className="nj-didit-reuse-error" role="alert">{error}</p>}
    {message&&<p className="nj-didit-reuse-message" role="status">{message}</p>}
    <small>The normal verification pause stays active for everyone else. Only a new authenticated live Didit approval with valid documentary 18+ evidence can grant this member access.</small>
  </section>;
}
