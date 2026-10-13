import { useEffect, useState } from 'react';
import { BellRing, Send, ShieldCheck } from 'lucide-react';
import { communityUpdates, type CommunityUpdateDelivery, type CommunityUpdateSummary } from '../platform/firebase-community-updates';
import './community-updates.css';

const INITIAL_TITLE='NightJar Community Development Update — 13 October 2026';
const INITIAL_BODY=[
 'Hello NightJar community,',
 'NightJar is taking shape, and we want to keep you involved as we build it. Your feedback is helping us make this a more welcoming, practical and enjoyable space.',
 'Recent development work includes:',
 '• A refined audio player, optional transcripts, improved playback controls and equaliser work.',
 '• Easier mobile audio uploads, smoother creator onboarding and support for multiple professional roles.',
 '• Creator profiles, sharing, likes, loves, comments and clearer collaboration tools.',
 '• Better script, artwork and review workflows, including notes and messaging.',
 '• Additional accessibility and theme options, clearer help icons and improvements to notifications.',
 'Some improvements are still being rolled out or tested on different devices, so you may not see everything immediately.',
 'Next we are focusing on reliability, notification testing, accessibility refinements and the safeguarding work required ahead of a wider launch.',
 'A quick favour: please tell us if you received this notification and whether tapping it opened the full message. If something does not work, your feedback helps us fix it.',
 'Thank you for building this with us.',
 '— The NightJar Team',
].join('\n\n');

export default function AdminCommunityUpdates(){
 const [title,setTitle]=useState(INITIAL_TITLE);
 const [body,setBody]=useState(INITIAL_BODY);
 const [tested,setTested]=useState(false);
 const [confirm,setConfirm]=useState(false);
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState<{scope:'self'|'all';delivery:CommunityUpdateDelivery}|null>(null);
 const [history,setHistory]=useState<CommunityUpdateSummary[]>([]);
 const [error,setError]=useState('');
 const reload=()=>communityUpdates.history().then(data=>setHistory(data.updates??[])).catch(()=>{});
 useEffect(()=>{void reload();},[]);
 const send=async(scope:'self'|'all')=>{
  if(busy||!title.trim()||body.trim().length<40)return;
  if(scope==='all'&&(!tested||!confirm))return;
  setBusy(true);setError('');setResult(null);
  try{
   const delivery=await communityUpdates.publish({title:title.trim(),body:body.trim(),audience:scope,requestId:crypto.randomUUID(),testVerified:scope==='all'&&tested});
   setResult({scope,delivery});void reload();
   if(scope==='all'){setTested(false);setConfirm(false);}
  }catch(e){setError(e instanceof Error?e.message:'Could not send the announcement.');}
  finally{setBusy(false);}
 };
 const changed=(setter:(v:string)=>void)=>(value:string)=>{setter(value);setTested(false);setConfirm(false);};
 return <section className="nj-community-composer panel" aria-label="In-app community announcements">
  <div className="nj-community-composer-heading"><div>
   <span className="mini-label">COMMUNICATIONS · IN-APP & PUSH</span>
   <h2>Community announcements</h2>
   <p>Test a message privately, then send it to eligible members. The complete update opens inside NightJar. Recipients' notification privacy settings remain respected.</p>
  </div><BellRing size={22}/></div>
  <label>Headline <input maxLength={120} value={title} onChange={e=>changed(setTitle)(e.target.value)}/></label>
  <label>Announcement text <textarea rows={12} maxLength={4000} value={body} onChange={e=>changed(setBody)(e.target.value)}/></label>
  <small>Phone alerts are best-effort. A member who opted out of announcements is skipped. No email is sent.</small>
  <button className="secondary-button" type="button" disabled={busy||!title.trim()||body.trim().length<40} onClick={()=>void send('self')}>
   <Send size={15}/> 1. Send private test to my account
  </button>
  {result&&<p className="nj-community-result" role="status">
   <strong>{result.scope==='self'?'Owner test':'Community send'}: {result.delivery.status}.</strong>
   {' '+result.delivery.inboxCreated+' inbox record(s) created, '+result.delivery.errors+' error(s). Check your device to confirm push delivery.'}
  </p>}
  <label className="nj-community-confirm"><input type="checkbox" checked={tested} onChange={e=>setTested(e.target.checked)}/> I personally received and opened the private test successfully.</label>
  <label className="nj-community-confirm"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> I approve sending this update to all active NightJar members who permit announcements.</label>
  <button className="primary-button" type="button" disabled={busy||!tested||!confirm||!title.trim()||body.trim().length<40} onClick={()=>void send('all')}>
   <ShieldCheck size={15}/> 2. Publish to community
  </button>
  {error&&<p role="alert">{error}</p>}
  {history.length>0&&<details className="nj-community-history"><summary>Recent updates ({history.length})</summary>{history.map(item=>
   <article key={item.id}><strong>{item.title}</strong><small>{item.audience==='self'?'Owner test':'Community'} · {item.status} · {item.outcome?.inboxCreated??0} recipients</small></article>
  )}</details>}
 </section>;
}
