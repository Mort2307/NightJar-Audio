import { useEffect, useState } from 'react';
import { Camera, FileCheck2, RefreshCw, ShieldAlert, Sun } from 'lucide-react';
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

const captureRules = [
  'Use the original, real physical identity document. Do not use a screenshot, scan, photocopy, printout or a photo of a document displayed on another screen.',
  'Use bright, even natural light. Avoid dark rooms, harsh direct glare and shadows across the document.',
  'Place the document flat on a plain, darker surface and keep all four corners visible inside the camera frame.',
  'Remove plastic sleeves or wallet covers. Reflections can hide security details and stop the camera focusing.',
  'Hold the phone steady, clean the camera lens and wait for the text and photograph to come into sharp focus.',
  'Capture both front and back when Didit asks for them. Do not crop, filter, edit or cover any part of the document.',
  'Use a current, unexpired document accepted by the verification flow. Accepted document types depend on the country and NightJar’s Didit configuration.',
  'Open the verification link in your normal browser (such as Chrome or Safari) and allow camera access. Avoid in-app browsers if the camera will not open.',
];

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
  useEffect(()=>{
    const code=status?.guidance?.code;
    if(code==='document_expired') setReason('expired_document');
    else if(code==='mrz_invalid'||code==='nfc_mismatch'||code==='document_issue'||code==='document_unsupported')
      setReason('document_not_detected');
    else if(code==='image_blurry'||code==='image_dark'||code==='image_bright'||code==='image_quality')
      setReason('unclear_document');
  },[status?.guidance?.code]);
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
  const guidance=status?.guidance??null;
  return <section className="nj-didit-resubmission" aria-label="Identity document help and resubmission">
    <header><FileCheck2 size={21} aria-hidden="true"/>
      <div><h3>Let’s get your ID check completed</h3>
        <p>We’ll explain what needs attention and help you return to the exact verification session NightJar has reviewed. You do not upload identity documents to NightJar.</p>
      </div></header>

    {guidance && <section className="nj-didit-guidance" aria-live="polite">
      <span className="mini-label">YOUR VERIFICATION RESULT</span>
      <h4>{guidance.title}</h4>
      <p>{guidance.explanation}</p>
      <p><strong>What to do next:</strong> {guidance.action}</p>
      {!guidance.canRetake && <p className="nj-didit-guidance-hold">Please do not submit another document yet. This result needs NightJar support to review it first.</p>}
    </section>}
    {status?.guidanceUnavailable && <p className="nj-didit-resubmission-message" role="status">
      NightJar could not safely retrieve the individual Didit check, so we will not guess what went wrong or ask you to pay for another attempt. Please contact NightJar support.
    </p>}
    {!guidance && status?.message && <p className="nj-didit-resubmission-message" role="status">{status.message}</p>}

    <section className="nj-didit-capture-standard" aria-label="NightJar document photo standard">
      <div className="nj-didit-capture-heading"><Camera size={18} aria-hidden="true"/><h4>NightJar’s document photo standard</h4></div>
      <p>Before you open the camera, check every point below. These steps help Didit read the document accurately and reduce avoidable repeat checks.</p>
      <ul>{captureRules.map((rule,index)=><li key={index}>{rule}</li>)}</ul>
      <p className="access-fine"><Sun size={15} aria-hidden="true"/> Best setup: bright, indirect natural daylight, a plain dark surface and the original physical document.</p>
    </section>

    {status?.status==='ready' && <p className="nj-didit-resubmission-message" role="status">
      NightJar has authorised the replacement document step in your existing session. Open the same secure Didit session; the selected document check is the only step NightJar has requested you to repeat. Didit controls the exact screen shown inside its hosted flow.
    </p>}
    {link && <a className="secondary-button wide-button nj-didit-continue" href={link} target="_blank" rel="noopener noreferrer">
      {status?.status==='ready'?'Continue to your document retake':'Open existing Didit session'}
    </a>}
    {status?.status==='requested' && <p className="access-fine">Your request is awaiting NightJar review. No new verification has started; you do not need to send ID photos to us.</p>}
    {status?.status==='processing' && <p className="access-fine">NightJar is checking the existing session with Didit. Please do not press retry or create another check.</p>}

    {status?.canRequest && <div className="nj-didit-resubmission-request">
      <label htmlFor="nj-didit-resubmission-reason">Which of these best describes what happened?</label>
      <select id="nj-didit-resubmission-reason" value={reason}
        onChange={event=>setReason(event.target.value as DiditResubmissionReason)}>
        {options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button type="button" className="secondary-button wide-button" onClick={()=>void submit()} disabled={loading}>
        {loading?'Sending review request…':'Request document review'}
      </button>
      <p className="access-fine">This asks NightJar to review your existing session. It does not start a new session or charge you. If a replacement check is appropriate, an administrator will authorise it.</p>
    </div>}
    {(error||notice)&&<p role="status" className="nj-didit-resubmission-message"><ShieldAlert size={15} aria-hidden="true"/>{error||notice}</p>}
    <button type="button" className="ghost-button" disabled={loading} onClick={()=>void refresh()}>
      <RefreshCw size={15} aria-hidden="true"/> Refresh document status
    </button>
  </section>;
}
