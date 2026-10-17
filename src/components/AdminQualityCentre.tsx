import { useState } from 'react';
import { Activity, ClipboardCheck, RefreshCw, ShieldAlert } from 'lucide-react';
import { nightjarQuality, type QualityCheck, type QualityStatus, type TesterFeedback, type FeedbackStatus } from '../platform/firebase-quality';
import './nightjar-quality.css';

const acceptance=[
  ['age','1 · Mandatory live Didit'],
  ['existing_verified','2 · Existing approved ID checks'],
  ['legal','3 · Sign-in and legal agreements'],
  ['credits_member','4 · My credited releases'],
  ['credits_invitation','5 · Uploader invitations'],
  ['credits_confirmation','6 · Uploader credit confirmation'],
  ['credits_admin','7 · Independent admin credit review'],
  ['credits_appeals','8 · Appeals and revocation'],
  ['official_moon','9 · Official gold moon only for professionals'],
  ['credited_listener','10 · Credited Listener after review'],
  ['connections','11 · Followers and following'],
  ['navigation','12 · Navigation and search'],
  ['notifications','13 · In-app notifications and destinations'],
  ['push','14 · Real device push delivery'],
  ['listening','15 · Spotlight, Home and playback'],
  ['professional','16 · Professional studios and accessibility'],
  ['cross_device','Cross-device save and recovery'],
  ['payment_provider','Approved adult-content payment processor'],
  ['legal_signoff','Independent launch legal/compliance sign-off'],
] as const;
type Props={pendingApplications:number;pendingImages:number;openAlerts:number};
const labels:Record<QualityStatus,string>={pass:'PASS',fail:'FAIL',blocked:'BLOCKED',not_verified:'NOT VERIFIED'};
export default function AdminQualityCentre({pendingApplications,pendingImages,openAlerts}:Props){
  const [open,setOpen]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [checks,setChecks]=useState<Record<string,QualityCheck>>({});
  const [feedback,setFeedback]=useState<TesterFeedback[]>([]);
  const [feedbackMore,setFeedbackMore]=useState(false);
  const [loadError,setLoadError]=useState('');
  const [notice,setNotice]=useState('');
  const [selected,setSelected]=useState<string>('credits_member');
  const [decision,setDecision]=useState<QualityStatus>('not_verified');
  const [evidence,setEvidence]=useState('');
  const [reviewStatus,setReviewStatus]=useState<Record<string,FeedbackStatus>>({});
  const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
  const load=async()=>{
    if(busy)return;
    setBusy(true);setLoadError('');
    try{
      const [checkData,queue]=await Promise.all([nightjarQuality.checks(),nightjarQuality.queue()]);
      setChecks(checkData);setFeedback(queue.feedback);setFeedbackMore(queue.hasMore);setLoaded(true);
      const row=checkData[selected];if(row){setDecision(row.status);setEvidence(row.evidence);}
    }catch(e){setLoadError(e instanceof Error?e.message:'Quality records could not be loaded.');}
    finally{setBusy(false);}
  };
  const select=(id:string)=>{
    setSelected(id);setDecision(checks[id]?.status??'not_verified');setEvidence(checks[id]?.evidence??'');setNotice('');
  };
  const save=async()=>{
    setBusy(true);setNotice('');setLoadError('');
    try {
      await nightjarQuality.record(selected,decision,evidence.trim());
      await loadQualityState();
      setNotice('Saved as an audited human review, not an automated test.');
    }catch(e){setLoadError(e instanceof Error?e.message:'Could not store the acceptance record.');}
    finally {setBusy(false);}
  };
  const loadQualityState=async()=>setChecks(await nightjarQuality.checks());
  const triage=async(item:TesterFeedback)=>{
    const status=reviewStatus[item.id]??item.status;
    const note=reviewNotes[item.id]??item.triageNote??'';
    setBusy(true);setLoadError('');setNotice('');
    try{
      await nightjarQuality.review(item.id,status,note);
      const queue=await nightjarQuality.queue();
      setFeedback(queue.feedback);setFeedbackMore(queue.hasMore);
      setNotice('Feedback status and review reason saved.');
    }catch(e){setLoadError(e instanceof Error?e.message:'Could not update feedback.');}
    finally{setBusy(false);}
  };
  const passed=acceptance.filter(([id])=>checks[id]?.status==='pass').length;
  const failed=acceptance.filter(([id])=>checks[id]?.status==='fail').length;
  const unverified=acceptance.length-passed-failed;
  return <section className="panel nj-quality-centre" aria-label="Nightjar quality and release centre">
    <header className="nj-quality-head"><div><span className="mini-label">OWNER OPERATIONS · EVIDENCE FIRST</span>
      <h2><ClipboardCheck size={20}/> Quality &amp; Release Centre</h2>
      <p>Monitor actual review queues, capture tester issues and record independent real-account acceptance. This never grants roles, changes age verification or enables checkout.</p>
    </div></header>
    <div className="nj-quality-operational-metrics">
      <div><small>Pending professional applications</small><strong>{pendingApplications}</strong><span>Real admin queue count</span></div>
      <div><small>Artwork awaiting moderation</small><strong>{pendingImages}</strong><span>Real admin queue count</span></div>
      <div><small>Open security alerts</small><strong>{openAlerts}</strong><span>Real admin queue count</span></div>
      <div><small>Activation / retention / cost per user</small><strong>Not measured</strong><span>No invented analytics or extra tracking</span></div>
    </div>
    <button type="button" className="secondary-button nj-quality-open" aria-expanded={open} onClick={()=>{
      setOpen(!open);if(!open&&!loaded)void load();
    }}>{open?'Close the Quality Centre':'Open quality checks and tester feedback'}</button>
    {open&&<div className="nj-quality-body">
      <div className="nj-quality-toolbar"><h3>Human-verified acceptance</h3>
        <button type="button" className="secondary-button" disabled={busy} onClick={()=>void load()}><RefreshCw size={15}/> Refresh</button>
      </div>
      <p>Unrecorded checks default to NOT VERIFIED. Prior conversational reports are not silently marked PASS. A PASS requires genuine observed evidence and an accountable administrator action.</p>
      {loaded&&<div className="nj-quality-summary" role="status">
        <span>{passed} verified PASS</span><span>{unverified} not passed / blocked / unverified</span><span>{failed} FAIL</span>
      </div>}
      <div className="nj-quality-checks">
        {acceptance.map(([id,title])=><button key={id} type="button"
          className={selected===id?'nj-quality-check active':'nj-quality-check'} onClick={()=>select(id)}>
          <span>{title}</span><strong>{labels[checks[id]?.status??'not_verified']}</strong>
        </button>)}
      </div>
      <div className="nj-quality-review">
        <h3>{acceptance.find(([id])=>id===selected)?.[1]}</h3>
        <label htmlFor="nj-quality-decision">Observed result</label>
        <select id="nj-quality-decision" value={decision} onChange={e=>setDecision(e.target.value as QualityStatus)}>
          <option value="not_verified">NOT VERIFIED</option><option value="pass">PASS</option>
          <option value="fail">FAIL</option><option value="blocked">BLOCKED</option>
        </select>
        <label htmlFor="nj-quality-evidence">Observed evidence / date / roles / devices</label>
        <textarea id="nj-quality-evidence" maxLength={500} rows={3} value={evidence}
          onChange={e=>setEvidence(e.target.value)}
          placeholder="Describe the actual result. Never include ID documents, passwords or account UID tokens."/>
        <button type="button" className="primary-button" disabled={busy||(decision==='pass'&&evidence.trim().length<20)}
          onClick={()=>void save()}>{busy?'Saving…':'Save reviewed result'}</button>
      </div>
      <div className="nj-quality-toolbar"><h3>Private tester feedback · latest 75</h3>
        <span>{feedback.length} loaded{feedbackMore?' · more available':''}</span></div>
      {!feedback.length&&<p>No feedback records in the current queue.</p>}
      {feedback.map(item=><article key={item.id} className="nj-quality-ticket">
        <div><strong>{item.category.toUpperCase()} · {item.status.replaceAll('_',' ')}</strong>
          <small>{item.route} · {item.createdAt?new Date(item.createdAt).toLocaleString('en-GB'):'Time pending'}</small></div>
        <p>{item.details}</p>
        <label htmlFor={'nj-ticket-status-'+item.id}>Triage status</label>
        <select id={'nj-ticket-status-'+item.id} value={reviewStatus[item.id]??item.status}
          onChange={e=>setReviewStatus(prev=>({...prev,[item.id]:e.target.value as FeedbackStatus}))}>
          <option value="new">New</option><option value="triaged">Triaged</option>
          <option value="in_progress">In progress</option><option value="fixed">Fixed</option><option value="closed">Closed</option>
        </select>
        <label htmlFor={'nj-ticket-note-'+item.id}>Reviewer note / resolution</label>
        <textarea id={'nj-ticket-note-'+item.id} maxLength={500} rows={2}
          value={reviewNotes[item.id]??item.triageNote??''}
          onChange={e=>setReviewNotes(prev=>({...prev,[item.id]:e.target.value}))}/>
        <button type="button" className="secondary-button" disabled={busy}
          onClick={()=>void triage(item)}>Save triage and audit</button>
      </article>)}
      {loadError&&<p className="nj-quality-error" role="alert"><ShieldAlert size={16}/>{loadError}</p>}
      {notice&&<p className="nj-quality-good" role="status"><Activity size={16}/>{notice}</p>}
    </div>}
  </section>;
}
