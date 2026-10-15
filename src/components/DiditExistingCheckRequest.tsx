import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { nightjarDiditReuse, type MemberDiditReuse } from '../platform/firebase-didit-reuse';

export default function DiditExistingCheckRequest() {
  const [record,setRecord] = useState<MemberDiditReuse|null>(null);
  const [consented,setConsented] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const refresh = async () => {
    setBusy(true);
    setError('');
    try {setRecord(await nightjarDiditReuse.memberStatus());}
    catch(e){setError(e instanceof Error?e.message:'Unable to check your existing verification enquiry.');}
    finally {setBusy(false);}
  };
  useEffect(()=>{void refresh();},[]);
  const active = record && ['requested','investigating','waiting_for_member'].includes(record.status);
  const request = async () => {
    if(!consented || busy || !window.confirm('Ask Nightjar to investigate reuse of an ALREADY APPROVED Didit check? This records your request, but does not itself verify your identity, contact Didit, or initiate a new ID check.'))return;
    setBusy(true);setError('');setMessage('');
    try{
      const res=await nightjarDiditReuse.request();
      setMessage(res.status==='already_verified'
        ? 'Your Nightjar account already has a provider-verified 18+ result.'
        : 'Your request is recorded. Nightjar will review the existing check without initiating another identity session.');
      setRecord(await nightjarDiditReuse.memberStatus());
      setConsented(false);
    }catch(e){setError(e instanceof Error?e.message:'Unable to request reuse of your previous Didit check.');}
    finally{setBusy(false);}
  };
  const cancel = async () => {
    if(busy || !window.confirm('Withdraw your Didit reuse request? This will not affect any already-verified status.'))return;
    setBusy(true);setError('');setMessage('');
    try{await nightjarDiditReuse.withdraw();setRecord(await nightjarDiditReuse.memberStatus());setMessage('Request withdrawn.');}
    catch(e){setError(e instanceof Error?e.message:'Unable to withdraw your request.');}
    finally{setBusy(false);}
  };
  return <section className="nj-didit-reuse-member" aria-label="Reuse previous Didit verification">
    <span className="mini-label"><ShieldCheck size={15} aria-hidden="true"/> DIDIT · PREVIOUSLY VERIFIED?</span>
    <h3>Already completed a Didit check?</h3>
    <p>If you were approved in Didit before linking your Nightjar account, request a review here. Your previous <strong>standalone</strong> check is not automatically proof of account ownership.</p>
    <p>Didit's Reusable KYC can allow you to consent to share an earlier result after a short identity confirmation. Nightjar will only link an approval after receiving authenticated provider evidence tied to your signed-in account. Public verification is still paused.</p>
    {record && active && <div className="nj-didit-reuse-current" role="status">
      <CheckCircle2 size={18} aria-hidden="true"/>
      <div><strong>{record.status==='requested'?'Request received':record.status==='investigating'?'Nightjar is investigating':'Awaiting secure member follow-up'}</strong><p>{record.note}</p>
        {record.requestedAt && <small>Requested {new Date(record.requestedAt).toLocaleString('en-GB')}</small>}
      </div>
    </div>}
    {!active && <>
      <label className="nj-didit-reuse-consent">
        <input type="checkbox" checked={consented} disabled={busy} onChange={event=>setConsented(event.target.checked)}/>
        <span>I already completed a Didit check, and I consent to Nightjar recording my request to investigate reuse. I understand this does not verify my Nightjar account or authorise sharing an identity report without a separate secure confirmation.</span>
      </label>
      <button type="button" className="secondary-button" disabled={!consented || busy} onClick={()=>void request()}>{busy?'Working…':'Request reuse of my existing Didit check'}</button>
    </>}
    {active && <button type="button" className="secondary-button" disabled={busy} onClick={()=>void cancel()}><XCircle size={15} aria-hidden="true"/> Withdraw request</button>}
    <button type="button" className="ghost-button" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={15} aria-hidden="true"/> Refresh request status</button>
    {error && <p role="alert" className="nj-didit-reuse-error">{error}</p>}
    {message && <p role="status" className="nj-didit-reuse-message">{message}</p>}
    <small>Nightjar will never mark an account verified from a claim, shared IP address, name match or administrator approval alone. Do not repeat your ID check while maintenance continues.</small>
  </section>;
}
