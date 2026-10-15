import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { nightjarAge, type SingleMemberDiditMaintenanceStatus } from '../platform/firebase-age';
import { nightjarLegal } from '../platform/firebase-legal';
import { NIGHTJAR_AGE_NOTICE_VERSION } from '../legal/nightjarLegal';

export default function ControlledSingleMemberDiditCheck() {
  const [status,setStatus]=useState<SingleMemberDiditMaintenanceStatus|null>(null);
  const [noticeAcknowledged,setNoticeAcknowledged]=useState(false);
  const [consent,setConsent]=useState(false);
  const [noticeAlreadyAccepted,setNoticeAlreadyAccepted]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [launchUrl,setLaunchUrl]=useState<string|null>(null);

  const refresh=async()=>{
    setLoading(true);setError('');
    try{
      const [pilot,agreements]=await Promise.all([nightjarAge.singleMemberMaintenanceStatus(),nightjarLegal.status()]);
      setStatus(pilot);
      setNoticeAlreadyAccepted(agreements.documents.some(document=>
        document.id==='age_assurance_notice' && document.accepted && document.version===NIGHTJAR_AGE_NOTICE_VERSION
      ));
      if(pilot.sessionLaunchUrl)setLaunchUrl(pilot.sessionLaunchUrl);
      if(pilot.providerVerified)setMessage('Verified 18+ — Nightjar has permanently saved the valid live Didit result on your account.');
    }catch(err){setError(err instanceof Error?err.message:'Nightjar could not confirm your one-off verification invitation.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void refresh();},[]);

  if(status===null || status.reason==='not_invited' || !status.eligible)return null;

  const start=async()=>{
    if(loading||!consent||(!noticeAlreadyAccepted&&!noticeAcknowledged))return;
    if(!window.confirm('You are about to request ONE REAL Didit identity check linked to THIS Nightjar account. You may need to show your ID and complete a selfie/liveness check. This may incur a charge to Nightjar. The action cannot be automatically retried. Start now?'))return;
    setLoading(true);setError('');setMessage('');
    try{
      if(!noticeAlreadyAccepted){
        await nightjarLegal.accept([{
          id:'age_assurance_notice',version:NIGHTJAR_AGE_NOTICE_VERSION,accepted:true,
        }],'meg-one-time-live-didit-consent');
        setNoticeAlreadyAccepted(true);
      }
      const outcome=await nightjarAge.startSingleMemberMaintenanceCheck();
      if(outcome.verified){
        setMessage('Nightjar has already saved a valid live Didit 18+ verification for your account. No new check was started.');
      }else if(outcome.launchUrl){
        setLaunchUrl(outcome.launchUrl);
        setMessage('Your existing one-use Didit check is ready. Open the secure session link below. Do not create another check.');
      }else{
        setMessage('Your check request was received. Refresh your status before taking further action.');
      }
      setStatus(await nightjarAge.singleMemberMaintenanceStatus());
    }catch(err){
      setError(err instanceof Error?err.message:'Nightjar could not complete the live-check request. Do not retry without reviewing your status.');
      try{setStatus(await nightjarAge.singleMemberMaintenanceStatus());}catch{/* retain current UI */}
    }finally{setLoading(false);}
  };

  return <section className="nj-single-member-didit" aria-label="One-time account-linked Didit verification">
    <span className="mini-label"><ShieldCheck size={16} aria-hidden="true"/> DIDIT · ONE CONTROLLED LIVE CHECK</span>
    <h3>Verify this Nightjar account with Didit</h3>
    <p>Your earlier Didit test was not attached to your Nightjar account. This is a <strong>new standard ID verification</strong> that will be securely linked to the account you are signed into now.</p>
    <p>Public checks remain switched off; this invitation is for one existing approved administrator request only. Your previous Didit result remains unchanged. A second verification may trigger provider duplicate-identity warnings or a normal check charge.</p>

    {status?.providerVerified ? <p className="nj-single-member-didit-success" role="status">
      <CheckCircle2 size={21} aria-hidden="true"/> VERIFIED 18+ — your Didit approval is securely saved in Nightjar. No further ID check is required.
    </p> : <>
      {status?.alreadyClaimed && <p className="nj-single-member-didit-info" role="status">
        This one-time check has already been claimed. {status.existingSession ? 'Continue your linked Didit session below.' : 'No safe session link is available. Contact Nightjar support rather than starting another check.'}
      </p>}
      {!status?.alreadyClaimed && status?.checkAvailable && <>
        <p><a href="/legal/age-verification" target="_blank" rel="noopener noreferrer">Read Nightjar's Age Verification &amp; Didit Privacy Notice <ExternalLink size={14} aria-hidden="true"/></a></p>
        {!noticeAlreadyAccepted ? <label className="nj-didit-reuse-consent">
          <input type="checkbox" checked={noticeAcknowledged} disabled={loading} onChange={e=>setNoticeAcknowledged(e.target.checked)}/>
          <span>I have read and acknowledge Nightjar's Age Verification &amp; Didit Privacy Notice (version {NIGHTJAR_AGE_NOTICE_VERSION}).</span>
        </label> : <p>Privacy notice already acknowledged for this account.</p>}
        <label className="nj-didit-reuse-consent">
          <input type="checkbox" checked={consent} disabled={loading} onChange={e=>setConsent(e.target.checked)}/>
          <span>I choose to start one live ID and facial/liveness verification on <strong>my own Nightjar account</strong>. I understand it may incur a charge to Nightjar and may be recognised as a previous Didit identity.</span>
        </label>
        <button type="button" className="primary-button" onClick={()=>void start()}
          disabled={loading||!consent||(!noticeAlreadyAccepted&&!noticeAcknowledged)}>
          <LockKeyhole size={16} aria-hidden="true"/>{loading?'Preparing secure check…':'Start my one-time Didit ID check'}
        </button>
      </>}
      {status && !status.checkAvailable && !status.alreadyClaimed && <p className="nj-single-member-didit-info" role="status">
        The check is not ready for this account. Contact Nightjar support; no verification was started.
      </p>}
    </>}
    {(launchUrl||status?.sessionLaunchUrl) && !status?.providerVerified && <a className="secondary-button nj-single-member-didit-link"
      href={launchUrl||status?.sessionLaunchUrl||'#'} target="_blank" rel="noopener noreferrer">
      Open my existing Didit session <ExternalLink size={16} aria-hidden="true"/>
    </a>}
    <button type="button" className="secondary-button" onClick={()=>void refresh()} disabled={loading}>
      <RefreshCw size={16} aria-hidden="true"/>{loading?'Checking status…':'Refresh my verification status'}
    </button>
    {error&&<p className="nj-didit-reuse-error" role="alert">{error}</p>}
    {message&&<p className="nj-didit-reuse-message" role="status">{message}</p>}
    <small>No ID images are uploaded to Nightjar. The final Verified 18+ state is granted only after Didit's signed live approval with valid documentary adult evidence is accepted against this exact account.</small>
  </section>;
}
