import { useEffect, useState } from 'react';
import { CheckCircle2, CircleHelp, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { nightjarDiditReuse, type AdminDiditReuse, type DiditReuseWorkflowReadiness } from '../platform/firebase-didit-reuse';

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AdminDiditReuseReadiness() {
  const [workflowId,setWorkflowId]=useState('');
  const [sourceId,setSourceId]=useState('');
  const [selectedUid,setSelectedUid]=useState('');
  const [requests,setRequests]=useState<AdminDiditReuse[]>([]);
  const [ready,setReady]=useState<DiditReuseWorkflowReadiness|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const refresh=async()=>{
    setBusy(true);setError('');
    const [workflow,queue]=await Promise.allSettled([nightjarDiditReuse.readiness(),nightjarDiditReuse.adminList()]);
    if(workflow.status==='fulfilled')setReady(workflow.value);
    if(queue.status==='fulfilled')setRequests(queue.value.requests.filter(x=>x.status==='approved_for_reuse'));
    if(workflow.status==='rejected'||queue.status==='rejected')setError('Cannot load reuse readiness. The protected Firebase functions may still need deploying.');
    setBusy(false);
  };
  useEffect(()=>{void refresh();},[]);
  const inspectWorkflow=async()=>{
    if(!uuidPattern.test(workflowId.trim())||busy)return;
    if(!window.confirm('Perform a READ-ONLY inspection of this Didit workflow? It will not start a verification or incur an identity-check charge.'))return;
    setBusy(true);setError('');setMessage('');
    try{
      const result=await nightjarDiditReuse.inspectWorkflow(workflowId.trim());
      setMessage(result.nextStep);
      setReady(await nightjarDiditReuse.readiness());
    }catch(e){setError(e instanceof Error?e.message:'The workflow could not be inspected. No verification was started.');}
    finally{setBusy(false);}
  };
  const inspectSource=async()=>{
    if(!selectedUid||!uuidPattern.test(sourceId.trim())||busy)return;
    if(!window.confirm('READ-ONLY retrieve the original approved Didit decision and reserve its opaque session reference for this member? This does NOT verify their Nightjar account or begin another ID check.'))return;
    setBusy(true);setError('');setMessage('');
    try{
      const result=await nightjarDiditReuse.inspectOriginal(selectedUid,sourceId.trim());
      setMessage(result.nextStep);
      setSourceId('');
    }catch(e){setError(e instanceof Error?e.message:'Nightjar could not securely inspect this historic session. No identity check was started.');}
    finally{setBusy(false);}
  };
  return <section className="nj-didit-reuse-admin" aria-label="Didit reusable-KYC integration readiness">
    <div className="nj-didit-reuse-admin-head"><div>
      <span className="mini-label"><ShieldCheck size={15} aria-hidden="true"/> SECURE IDENTITY REUSE · NEXT STAGE</span>
      <h3>Connect the original approval</h3>
      <p>This is the next stage after approving a member's request. Nightjar must independently check their original Didit 18+ decision and confirm a published, zero-cost Reusable KYC workflow.</p>
    </div><button type="button" className="secondary-button" onClick={()=>void refresh()} disabled={busy}><RefreshCw size={15}/> Refresh readiness</button></div>
    <div className="nj-didit-reuse-stage">
      <span className="status-pill muted">{ready?.workflowRecognised?'WORKFLOW CHECKED':'WORKFLOW NOT READY'}</span>
      <strong>{ready?.workflowLabel||'No provider-approved reusable workflow selected'}</strong>
      <p>Original identity reuse is not yet activated. No member selfie session can start until the provider can supply a cryptographically authenticated link between the original record and the new account-bound result.</p>
      <p>Ordinary public identity checks remain paused. A cost check and published workflow alone do not authorise launch.</p>
    </div>
    <div className="nj-didit-reuse-setup">
      <h4>1. Inspect the Reusable KYC workflow</h4>
      <p>Create a separate Reusable KYC / selfie-only workflow in Didit. Paste its workflow UUID here. Nightjar verifies published status, workflow type, liveness, face match and a zero total price through Didit's own API.</p>
      <label htmlFor="nj-didit-reuse-workflow-id">Didit reusable workflow ID (UUID)</label>
      <input id="nj-didit-reuse-workflow-id" type="text" inputMode="text" autoComplete="off" value={workflowId} onChange={e=>setWorkflowId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
      <button className="secondary-button" type="button" disabled={busy||!uuidPattern.test(workflowId.trim())} onClick={()=>void inspectWorkflow()}>
        <ShieldCheck size={16}/> Inspect workflow settings · no paid check
      </button>
      <a href="https://business.didit.me" target="_blank" rel="noopener noreferrer">Open Didit Business Console <ExternalLink size={14} aria-hidden="true"/></a>
    </div>
    <div className="nj-didit-reuse-setup">
      <h4>2. Inspect the original approved session</h4>
      <p>Select an approved member reuse enquiry and enter the UUID of their original standalone Didit session from the provider console. Nightjar checks its live Approved status, 18+ document evidence and liveness without storing licence details or images.</p>
      <label htmlFor="nj-didit-reuse-member">Approved reuse enquiry</label>
      <select id="nj-didit-reuse-member" value={selectedUid} onChange={e=>setSelectedUid(e.target.value)}>
        <option value="">Select a member</option>
        {requests.map(item=><option key={item.uid} value={item.uid}>{item.emailMasked || 'Member'} · request approved</option>)}
      </select>
      <label htmlFor="nj-didit-reuse-original-id">Original Didit session UUID</label>
      <input id="nj-didit-reuse-original-id" type="text" autoComplete="off" value={sourceId} onChange={e=>setSourceId(e.target.value)} placeholder="Existing session ID from Didit"/>
      <button className="secondary-button" type="button" disabled={busy||!selectedUid||!uuidPattern.test(sourceId.trim())} onClick={()=>void inspectSource()}>
        <CheckCircle2 size={16}/> Check original approval · no new ID check
      </button>
    </div>
    {error&&<p role="alert" className="nj-didit-reuse-error">{error}</p>}
    {message&&<p role="status" className="nj-didit-reuse-message">{message}</p>}
    <p><CircleHelp size={15} aria-hidden="true"/> Neither step marks the member Verified 18+. Their secure biometric ownership confirmation and account binding are still required before any permanent age pass can be issued.</p>
  </section>;
}
