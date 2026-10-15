import { useEffect,useState } from 'react';
import { CheckCircle2, ExternalLink, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { nightjarSingleDiditPilot,type DiditSingleMemberPilotStatus } from '../platform/firebase-didit-member-pilot';
import { nightjarLegal } from '../platform/firebase-legal';
import { nightjarAge } from '../platform/firebase-age';
import { NIGHTJAR_AGE_NOTICE_VERSION } from '../legal/nightjarLegal';

const validDiditLink = (value:unknown):value is string => {
  if(typeof value!=='string')return false;
  try {const u=new URL(value);return u.protocol==='https:' && ['verify.didit.me','verification.didit.me'].includes(u.hostname);}
  catch{return false;}
};

export default function DiditMemberNormalPilot() {
  const [pilot,setPilot]=useState<DiditSingleMemberPilotStatus|null>(null);
  const [loading,setLoading]=useState(true);
  const [starting,setStarting]=useState(false);
  const [noticeAccepted,setNoticeAccepted]=useState(false);
  const [permission,setPermission]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [launchUrl,setLaunchUrl]=useState<string|null>(null);
  const refresh=async()=>{
    setLoading(true);setError('');
    try{
      const status=await nightjarSingleDiditPilot.myStatus();
      setPilot(status);
      if(validDiditLink(status.existingLaunchUrl))setLaunchUrl(status.existingLaunchUrl);
      if(status.verified){setLaunchUrl(null);setMessage('Nightjar has confirmed and saved your live Didit Verified 18+ result.');}
    }catch(e){setError(e instanceof Error?e.message:'Unable to check controlled Didit eligibility.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void refresh();},[]);
  const start=async()=>{
    if(!pilot?.approvedForOneAttempt||!noticeAccepted||!permission||starting)return;
    if(!window.confirm('Start ONE real, potentially chargeable Didit ID and selfie verification, linked to YOUR signed-in Nightjar account? Do not start if you do not wish to complete this check. There will be no automatic retry.'))return;
    setStarting(true);setError('');setMessage('');
    try{
      // A durable, versioned legal acknowledgement is saved on this account
      // before the backend is permitted to consume its one-use ID-check token.
      await nightjarLegal.accept([{
        id:'age_assurance_notice',
        version:NIGHTJAR_AGE_NOTICE_VERSION,
        accepted:true,
      }],'didit-controlled-member-live-maintenance');
      const result=await nightjarSingleDiditPilot.startOneCheck();
      if(result.verified){setMessage('Nightjar already has a permanent Verified 18+ result for this account.');}
      else if(validDiditLink(result.launchUrl)){
        setLaunchUrl(result.launchUrl);
        setMessage('Your unique Nightjar-linked Didit session is ready. Open it below and finish your ID and selfie check once. Do not start a second check.');
      }else{
        setError('Nightjar did not receive a safe Didit session link. Do not retry; ask an administrator to inspect the original attempt.');
      }
      setPilot(await nightjarSingleDiditPilot.myStatus());
    }catch(e){
      setError((e instanceof Error?e.message:'Unable to start Didit.')+' Do not click Start again or create a second Didit check; Nightjar may have claimed the one permitted attempt.');
      try{setPilot(await nightjarSingleDiditPilot.myStatus());}catch{/* Preserve original error. */}
    }finally{setStarting(false);}
  };
  if(!pilot || pilot.stage==='not_authorised')return null;
  return <section className="nj-didit-reuse-member nj-didit-normal-pilot" aria-label="One-time Nightjar-linked Didit ID verification">
    <span className="mini-label"><ShieldCheck size={15} aria-hidden="true"/> DIDIT · CONTROLLED ACCOUNT VERIFICATION</span>
    <h3>{pilot.verified?'Verified 18+': 'Verify your Nightjar account once'}</h3>
    {pilot.verified? <p className="nj-didit-reuse-current"><CheckCircle2 size={18}/>Your Nightjar account has a provider-confirmed live adult verification. You do not need another ID check.</p> :
      <>
        <p>This is a one-time live test authorised specifically for your signed-in Nightjar account. It is separate from your earlier standalone Didit check. Ordinary public verification is still paused.</p>
        {pilot.stage==='ready'&&<>
          <p>You choose whether to proceed. Didit may ask for a government-issued photo ID and selfie/liveness evidence; a charge may apply to Nightjar. No verification begins until you press the button and confirm.</p>
          <a className="nj-didit-notice-link" href="/legal/age-verification" target="_blank" rel="noopener noreferrer">Read the age-verification and Didit privacy notice <ExternalLink size={14}/></a>
          <label className="nj-didit-reuse-consent"><input type="checkbox" checked={noticeAccepted} onChange={e=>setNoticeAccepted(e.target.checked)} disabled={starting}/>
            <span>I have read and acknowledge the current Nightjar Age Verification &amp; Didit Privacy Notice. I understand what identity information Didit processes and why.</span></label>
          <label className="nj-didit-reuse-consent"><input type="checkbox" checked={permission} onChange={e=>setPermission(e.target.checked)} disabled={starting}/>
            <span>I explicitly choose to start one real Didit ID verification on this Nightjar account. I understand it may incur a charge and cannot automatically be retried.</span></label>
          <button className="primary-button" type="button" disabled={starting||!noticeAccepted||!permission} onClick={()=>void start()}>
            <LockKeyhole size={16}/> {starting?'Creating your one-time session…':'Start my Nightjar-linked ID verification'}
          </button>
        </>}
        {pilot.stage==='session_claimed'&&<p>The one permitted check has already been started or claimed. Complete the existing session below if its link is available, then refresh your Nightjar status. If no link appears, contact the administrator; do not request a second session.</p>}
        {pilot.stage==='expired'&&<p>Your invitation expired before a check started. No new identity verification has been opened. Contact Nightjar support.</p>}
        {launchUrl&&validDiditLink(launchUrl)&&<a className="secondary-button" href={launchUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16}/> Open my existing Didit verification</a>}
      </>}
    <button className="ghost-button" type="button" disabled={loading||starting} onClick={()=>void refresh()}><RefreshCw size={15}/>{loading?'Checking…':'Refresh my verification status'}</button>
    {error&&<p role="alert" className="nj-didit-reuse-error">{error}</p>}
    {message&&<p role="status" className="nj-didit-reuse-message">{message}</p>}
    <small>The administrator cannot mark you Verified 18+. Only Nightjar's server-validated live Didit result can do that. Never upload identity documents directly to Nightjar messages.</small>
  </section>;
}
