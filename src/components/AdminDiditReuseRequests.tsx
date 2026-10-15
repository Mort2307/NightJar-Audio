import { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { nightjarDiditReuse, type AdminDiditReuse } from '../platform/firebase-didit-reuse';

export default function AdminDiditReuseRequests() {
  const [requests,setRequests]=useState<AdminDiditReuse[]>([]);
  const [loading,setLoading]=useState(false);
  const [acting,setActing]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const refresh=async()=>{
    setLoading(true);setError('');
    try{setRequests((await nightjarDiditReuse.adminList()).requests);}
    catch(e){setError(e instanceof Error?e.message:'Nightjar could not load Didit reuse enquiries.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void refresh();},[]);
  const change=async (uid:string,status:'investigating'|'waiting_for_member'|'closed')=>{
    if(!window.confirm('Update the request to '+status.replaceAll('_',' ')+'? This changes the support workflow ONLY; it cannot verify the member or alter their age assurance.'))return;
    setActing(uid);setError('');setNotice('');
    try{
      await nightjarDiditReuse.adminReview(uid,status);
      setNotice('Support request updated. No identity verification or Didit session was created.');
      setRequests((await nightjarDiditReuse.adminList()).requests);
    }catch(e){setError(e instanceof Error?e.message:'Unable to update support request.');}
    finally{setActing('');}
  };
  const active=requests.filter(x=>x.status!=='closed');
  return <section className="nj-didit-reuse-admin" aria-label="Existing Didit verification reuse requests">
    <div className="nj-didit-reuse-admin-head"><div><span className="mini-label"><ShieldCheck size={15} aria-hidden="true"/> EXISTING CHECKS · MANUAL FOLLOW-UP</span>
      <h3>Earlier Didit approvals</h3>
      <p>Member-consented requests to connect an older standalone Didit approval. A support review is <strong>not</strong> an identity verification. Each member must independently complete Didit's secure reuse or account-binding flow before receiving permanent 18+ status.</p>
    </div><button type="button" className="secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/>{loading?'Loading…':'Refresh requests'}</button></div>
    {error && <p className="nj-didit-reuse-error" role="alert">{error}</p>}
    {notice && <p className="nj-didit-reuse-message" role="status">{notice}</p>}
    {active.length === 0 && <p>No pending standalone Didit reuse requests. Members can submit one from Settings → Privacy and safety.</p>}
    {active.map(item=><article className="nj-didit-reuse-entry" key={item.uid}>
      <div className="nj-didit-reuse-entry-info">
        <strong>{item.emailMasked||'Member account'}</strong>
        <span className="status-pill muted">{item.status.replaceAll('_',' ')}</span>
        {item.requestedAt && <small>Requested {new Date(item.requestedAt).toLocaleString('en-GB')}</small>}
      </div>
      <p>Verify the account holder's consent and existing Didit record using the provider's supported KYC reuse flow. Do not transfer somebody else's result, edit vendor_data, or bypass the 18+ evidence checks.</p>
      <div className="nj-didit-reuse-admin-actions">
        <button className="secondary-button" type="button" disabled={Boolean(acting)} onClick={()=>void change(item.uid,'investigating')}>Investigating</button>
        <button className="secondary-button" type="button" disabled={Boolean(acting)} onClick={()=>void change(item.uid,'waiting_for_member')}>Awaiting member</button>
        <button className="secondary-button" type="button" disabled={Boolean(acting)} onClick={()=>void change(item.uid,'closed')}>Close enquiry</button>
      </div>
    </article>)}
    <small>All actions here affect the support request ledger only. They cannot approve, link, replay or start an ID verification session. Closed requests are hidden from the active queue.</small>
  </section>;
}
