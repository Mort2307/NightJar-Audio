import { useEffect, useState } from 'react';
import { FileCheck2, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  nightjarDiditResubmission,
  type DiditResubmissionReason,
  type DiditResubmissionStatus,
} from '../platform/firebase-didit-resubmission';
import './didit-document-resubmission.css';

const options: {value:DiditResubmissionReason;label:string}[] = [
  {value:'unclear_document',label:'My document photo was unclear'},
  {value:'wrong_document',label:'I uploaded the wrong document'},
  {value:'expired_document',label:'My identity document is expired'},
  {value:'document_not_detected',label:'Didit did not recognise my document'},
  {value:'other',label:'Another document issue'},
];
const verifiedDiditLink = (value:string | null):string | null => {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && !url.username && !url.password &&
      ['verify.didit.me','verification.didit.me'].includes(url.hostname) ? url.toString() : null;
  } catch { return null; }
};

export default function DiditDocumentResubmission() {
  const [status,setStatus]=useState<DiditResubmissionStatus|null>(null);
  const [reason,setReason]=useState<DiditResubmissionReason>('unclear_document');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const refresh=async()=>{
    setError('');
    try { setStatus(await nightjarDiditResubmission.status()); }
    catch { setError('Could not check your document review status. Please retry or contact NightJar support.'); }
  };
  useEffect(()=>{void refresh();},[]);
  const submit=async()=>{
    if(loading || status?.canRequest!==true)return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const response=await nightjarDiditResubmission.request(reason);
      setNotice(response.alreadyPending
        ? 'NightJar already has your request. No new verification was started.'
        : 'Your document request has been sent to NightJar for review. No new Didit check was started.');
      await refresh();
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'NightJar could not request a resubmission.');
    } finally {setLoading(false);}
  };
  const link=verifiedDiditLink(status?.launchUrl??null);
  return <section className="nj-didit-resubmission" aria-label="Replace an identity document">
    <header><FileCheck2 size={20} aria-hidden="true"/>
      <div><h3>Need to replace your ID document?</h3>
        <p>Ask NightJar to review the existing Didit session. No new identity session will be started by this request.</p>
      </div></header>
    {status?.message && <p className="nj-didit-resubmission-message" role="status">{status.message}</p>}
    {link && <a className="secondary-button wide-button" href={link} target="_blank" rel="noopener noreferrer">
      Open my existing Didit session
    </a>}
    {status?.status==='requested' && <p className="access-fine">Awaiting an administrator's review. You do not need to upload documents to NightJar itself.</p>}
    {status?.canRequest && <div className="nj-didit-resubmission-request">
      <label htmlFor="nj-didit-resubmission-reason">Which document issue needs attention?</label>
      <select id="nj-didit-resubmission-reason" value={reason}
        onChange={event=>setReason(event.target.value as DiditResubmissionReason)}>
        {options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button type="button" className="secondary-button wide-button" onClick={()=>void submit()} disabled={loading}>
        {loading?'Sending review request…':'Request document resubmission review'}
      </button>
      <p className="access-fine">Only a NightJar administrator can approve a replacement step. Didit may charge NightJar for the repeated document check and dependent checks.</p>
    </div>}
    {(error||notice)&&<p role="status" className="nj-didit-resubmission-message"><ShieldAlert size={15} aria-hidden="true"/>{error||notice}</p>}
    <button type="button" className="ghost-button" disabled={loading} onClick={()=>void refresh()}>
      <RefreshCw size={15} aria-hidden="true"/> Refresh document request
    </button>
  </section>;
}
