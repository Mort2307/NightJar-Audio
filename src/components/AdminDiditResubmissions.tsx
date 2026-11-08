import { useEffect, useState } from 'react';
import { FileCheck2, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  nightjarDiditResubmission,
  type AdminDiditResubmissionItem,
} from '../platform/firebase-didit-resubmission';
import './didit-document-resubmission.css';

const reasonLabel:Record<string,string>={
  unclear_document:'Document image unclear',
  wrong_document:'Wrong document submitted',
  expired_document:'Document expired',
  document_not_detected:'Document not recognised',
  other:'Other document problem',
};

export default function AdminDiditResubmissions() {
  const [rows,setRows]=useState<AdminDiditResubmissionItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [processing,setProcessing]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const refresh=async()=>{
    setLoading(true);
    setError('');
    try {setRows((await nightjarDiditResubmission.queue()).pending??[]);}
    catch {setError('Could not read the resubmission queue. Check admin permissions or deployment.');}
    finally {setLoading(false);}
  };
  useEffect(()=>{void refresh();},[]);
  const act=async(item:AdminDiditResubmissionItem,action:'approve'|'deny')=>{
    if(processing)return;
    const question=action==='approve'
      ? 'Authorise ONE replacement documentary ID step in this member’s EXISTING Didit session? This may cost NightJar credits and could trigger dependent checks. The original session must be checked first. This is NOT permission to approve an adult or start a new session.'
      : 'Decline this document-resubmission request? No provider check will be started.';
    if(!window.confirm(question))return;
    setProcessing(item.userId);
    setMessage('');
    setError('');
    try {
      const result=await nightjarDiditResubmission.review(item.userId,item.revision,action);
      setMessage(result.status==='ready'
        ? 'Didit confirmed a same-session ID document resubmission. The member can continue their existing session.'
        : result.status==='denied'
          ? 'Request declined without contacting Didit.'
          : 'No second provider request will be made. Inspect this session in Didit and resolve the review manually.');
      await refresh();
    } catch(cause) {setError(cause instanceof Error?cause.message:'Review failed; inspect the original session before retrying.');}
    finally {setProcessing(null);}
  };
  return <section className="nj-didit-resubmission-admin" aria-label="Pending document resubmission reviews">
    <header><FileCheck2 size={22} aria-hidden="true"/>
      <div><h3>Document resubmission requests</h3>
        <p>Review existing linked sessions. Only an explicit owner decision may restart a single ID document step.</p>
      </div>
    </header>
    <button type="button" className="secondary-button" onClick={()=>void refresh()} disabled={loading||!!processing}>
      <RefreshCw size={16} aria-hidden="true"/>{loading?'Loading queue…':'Refresh requests'}
    </button>
    {!loading&&!rows.length&&!error&&<p>No outstanding document requests.</p>}
    {rows.map(item=><article key={item.userId} className="nj-didit-resubmission-review">
      <strong>{item.email}</strong>
      <p>{reasonLabel[item.reason]??'Document issue'} · {item.status==='requested'?'Awaiting review':item.status==='processing'?'Provider result pending — do not retry':'Manual Didit investigation required'} · Previous same-session resubmissions: {item.cycle}
        {item.requestedAt?' · Requested '+new Date(item.requestedAt).toLocaleString('en-GB'):''}</p>
      {item.status==='requested' && <div className="nj-didit-resubmission-actions">
        <button type="button" className="primary-button" disabled={!!processing||loading}
          onClick={()=>void act(item,'approve')}>Approve one ID resubmission</button>
        <button type="button" className="secondary-button" disabled={!!processing||loading}
          onClick={()=>void act(item,'deny')}>Decline request</button>
      </div>}
      {item.status!=='requested' && <p className="access-fine">Inspect the original Didit session and NightJar audit record manually. This case cannot be resubmitted again from the queue.</p>}
    </article>)}
    {(error||message)&&<p className="nj-didit-resubmission-message" role="status">
      {error?<ShieldAlert size={15} aria-hidden="true"/>:null}{error||message}</p>}
    <p className="access-fine">Before authorising, inspect the individual ID check and DOB return settings in Didit. An Approved ID missing DOB is held for manual configuration review rather than recharged. No live verification is initiated by opening this dashboard.</p>
  </section>;
}
