import { useState, type FormEvent } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { nightjarQuality, type FeedbackKind } from '../platform/firebase-quality';
import './nightjar-quality.css';

const kinds:{id:FeedbackKind;label:string}[]=[
  {id:'bug',label:'Something broken'},
  {id:'usability',label:'Confusing or difficult'},
  {id:'feature',label:'Feature idea'},
  {id:'accessibility',label:'Accessibility'},
  {id:'other',label:'Other feedback'},
];
export default function TesterFeedbackForm() {
  const [category,setCategory]=useState<FeedbackKind>('usability');
  const [details,setDetails]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [receipt,setReceipt]=useState('');
  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    if(busy||details.trim().length<20)return;
    setBusy(true);setError('');setReceipt('');
    try {
      const location=window.location.pathname;
      const result=await nightjarQuality.send(category,location,details.trim());
      setReceipt(result.reference);setDetails('');
    } catch(e){setError(e instanceof Error?e.message:'Could not save your feedback.');}
    finally {setBusy(false);}
  };
  return <details className="nj-feedback-panel">
    <summary><MessageSquarePlus size={19} aria-hidden="true"/>
      <span><strong>Help shape NightJar</strong><small>Tell us what works, what doesn't or what you would change.</small></span>
      <span aria-hidden="true">⌄</span>
    </summary>
    <form onSubmit={event=>void submit(event)} className="nj-feedback-form">
      <p>Feedback is sent privately to the NightJar administrators. Do not include passwords, identification documents, intimate personal details or another member's private content.</p>
      <label htmlFor="nightjar-feedback-kind">What kind of feedback?</label>
      <select id="nightjar-feedback-kind" value={category} onChange={e=>setCategory(e.target.value as FeedbackKind)}>
        {kinds.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <label htmlFor="nightjar-feedback-details">What happened, or what would make NightJar better?</label>
      <textarea id="nightjar-feedback-details" value={details} maxLength={2500} minLength={20} rows={5}
        placeholder="What screen were you using? What did you expect? What would you change?"
        onChange={e=>setDetails(e.target.value)} required/>
      <small>{details.trim().length}/2,500 characters · 20 minimum · no screenshot or identity upload</small>
      <button type="submit" className="primary-button" disabled={busy||details.trim().length<20}>
        {busy?'Sending feedback…':'Send feedback privately'}
      </button>
      {receipt&&<p role="status" className="nj-quality-good">Feedback received. Your reference: {receipt}. Thank you.</p>}
      {error&&<p role="alert" className="nj-quality-error">{error}</p>}
    </form>
  </details>;
}
