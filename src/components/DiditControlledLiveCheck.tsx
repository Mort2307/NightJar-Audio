import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { nightjarDiditControlled, type DiditControlledStatus } from '../platform/firebase-didit-controlled';
import { nightjarLegal } from '../platform/firebase-legal';
import { NIGHTJAR_AGE_NOTICE_VERSION } from '../legal/nightjarLegal';

const isSafeDiditLink = (link: string | undefined | null) => {
  if (!link) return false;
  try {
    const uri = new URL(link);
    return uri.protocol === 'https:' && ['verify.didit.me','verification.didit.me'].includes(uri.hostname);
  } catch { return false; }
};

export default function DiditControlledLiveCheck({ onVerified }: { onVerified?: () => void } = {}) {
  const [status,setStatus]=useState<DiditControlledStatus|null>(null);
  const [legalAccepted,setLegalAccepted]=useState(false);
  const [legalAcknowledged,setLegalAcknowledged]=useState(false);
  const [permission,setPermission]=useState(false);
  const [pending,setPending]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [launchUrl,setLaunchUrl]=useState<string|null>(null);

  const refresh=async()=>{
    setPending(true);setError('');
    try {
      const result=await nightjarDiditControlled.status();
      setStatus(result);
      setLaunchUrl(isSafeDiditLink(result.launchUrl) ? result.launchUrl : null);
      if(result.authorised || result.providerVerified) {
        const agreements=await nightjarLegal.status();
        setLegalAccepted(agreements.documents.some(document=>
          document.id==='age_assurance_notice' &&
          document.version===NIGHTJAR_AGE_NOTICE_VERSION && document.accepted === true));
      }
      if (result.providerVerified) { setMessage('Nightjar has confirmed your permanent Didit Verified 18+ result.'); onVerified?.(); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check your account verification status.');
    } finally { setPending(false);setLoaded(true); }
  };
  useEffect(()=>{void refresh();},[]);

  // This is a READ of the existing Didit decision, not a new ID session.
  // The backend uses the signed-in account's stored session; no pasted IDs.
  const recover=async()=>{
    if(pending)return;
    setPending(true);setError('');setMessage('');
    try {
      const result=await nightjarDiditControlled.reconcile();
      if(result.verified) {
        setMessage('Didit has confirmed your existing approved 18+ result. Nightjar has securely linked it to your account.');
        const current=await nightjarDiditControlled.status();
        setStatus(current);
        if(current.providerVerified) onVerified?.();
      } else if(result.outcome==='adult_evidence_missing') {
        setMessage('Didit reports an approval, but Nightjar could not confirm the required 18+ documentary evidence. Contact support; do not repeat your ID check.');
      } else if(result.outcome==='provider_not_approved') {
        setMessage('Didit has not yet returned an approved verification decision for this Nightjar-linked session. If Didit showed a tick, contact support with the approximate time; do not start another check.');
      } else {
        setMessage('Nightjar could not locate a completed, account-linked session to recover. Contact support before repeating any ID check.');
      }
    } catch(cause) {
      setError(cause instanceof Error ? cause.message : 'Could not safely recover the existing Didit decision. Please contact support.');
    } finally {setPending(false);}
  };

  // Approved identities may only need to acknowledge an updated notice.
  // This records legal acknowledgement; it never launches a Didit session.
  const acceptApprovedNotice=async()=>{
    if (pending || !status?.providerVerified || !legalAcknowledged || legalAccepted) return;
    setPending(true); setError('');
    try {
      await nightjarLegal.accept([{
        id:'age_assurance_notice',
        version:NIGHTJAR_AGE_NOTICE_VERSION,
        accepted:true,
      }], 'didit-approved-account-notice-update');
      setLegalAccepted(true);
      setMessage('Your updated privacy notice has been acknowledged. No repeat ID check is needed.');
      onVerified?.();
    } catch(cause) {
      setError(cause instanceof Error ? cause.message : 'Nightjar could not save the updated notice. Please retry.');
    } finally { setPending(false); }
  };

  const begin=async()=>{
    if(pending || !permission || (!legalAccepted && !legalAcknowledged))return;
    if(!window.confirm('Start ONE real, account-linked Didit 18+ verification now? You may need to show your government ID and complete a selfie/liveness check. This may incur a charge to Nightjar. The attempt cannot be repeated automatically.'))return;
    setPending(true);setError('');setMessage('');
    try{
      if(!legalAccepted) {
        await nightjarLegal.accept([{
          id:'age_assurance_notice',
          version:NIGHTJAR_AGE_NOTICE_VERSION,
          accepted:true,
        }],'didit-controlled-member-live-check');
        setLegalAccepted(true);
      }
      const started=await nightjarDiditControlled.start();
      if(started.verified===true) {
        setMessage('Your account is already verified by Didit. No new check was started.');
        onVerified?.();
      } else if(isSafeDiditLink(started.launchUrl)) {
        setLaunchUrl(started.launchUrl!);
        setMessage('Your single live Didit session is ready. Tap “Open secure Didit verification” below to complete it.');
      } else {
        setMessage('Nightjar could not provide a secure Didit link. Please contact support. Do not attempt to create another check.');
      }
      setStatus(await nightjarDiditControlled.status());
    } catch(cause){
      setError(cause instanceof Error?cause.message:'Nightjar could not safely confirm the Didit session. Contact support; do not retry.');
    }finally{setPending(false);}
  };

  if(!loaded || !status || (!status.authorised && status.state==='none'))return null;
  const alreadyVerified=status.providerVerified;
  const canStart=status.authorised && !alreadyVerified && !launchUrl;
  return <section className="panel nj-didit-controlled-panel" aria-label="My one-time live Didit identity verification">
    <span className="mini-label"><ShieldCheck size={16} aria-hidden="true"/> YOUR ACCOUNT · LIVE ID VERIFICATION</span>
    <h2>Verify your identity with Didit</h2>
    {alreadyVerified ? <>
      <p><CheckCircle2 size={17} aria-hidden="true"/> Nightjar has securely recorded your permanent Didit <strong>Verified 18+</strong> result. Your identity check will not be repeated.</p>
      {!legalAccepted && <>
        <p>The age-verification privacy notice has been updated. Please read and acknowledge the <a href="/legal/age-verification" target="_blank" rel="noopener noreferrer">current notice <ExternalLink size={12}/></a> to continue. <strong>No new Didit check will be started.</strong></p>
        <label className="nj-didit-reuse-consent">
          <input type="checkbox" checked={legalAcknowledged} disabled={pending} onChange={e=>setLegalAcknowledged(e.target.checked)}/>
          <span>I have read and acknowledge the current age-verification privacy notice.</span>
        </label>
        <button className="primary-button" type="button" disabled={pending || !legalAcknowledged} onClick={()=>void acceptApprovedNotice()}>
          <CheckCircle2 size={16} aria-hidden="true"/> {pending ? 'Saving acknowledgement…' : 'Acknowledge notice and enter NightJar'}
        </button>
      </>}
    </> : <>
      <p>{status.selfServiceEnabled
          ? 'You can verify your age directly from your Nightjar account. No earlier Didit approval request or administrator selection is needed. Only you can choose to start the ID and liveness check.'
          : 'This is a single, administrator-authorised live verification for your own Nightjar account. It uses the normal Didit ID and liveness check, rather than attempting to transfer a previous standalone test.'}</p>
      {canStart && <>
        <p><strong>Before you start:</strong> Read the current <a href="/legal/age-verification" target="_blank" rel="noopener noreferrer">Age Verification &amp; Didit Privacy Notice <ExternalLink size={12}/></a>.</p>
        {!legalAccepted && <label className="nj-didit-reuse-consent">
          <input type="checkbox" checked={legalAcknowledged} disabled={pending} onChange={e=>setLegalAcknowledged(e.target.checked)}/>
          <span>I have read and acknowledge the current Nightjar age-verification privacy notice.</span>
        </label>}
        {legalAccepted && <p className="nj-didit-controlled-saved"><CheckCircle2 size={15}/> Privacy notice already accepted.</p>}
        <label className="nj-didit-reuse-consent">
          <input type="checkbox" checked={permission} disabled={pending} onChange={e=>setPermission(e.target.checked)}/>
          <span>I choose to start one live Didit ID and facial/liveness check. I understand that this can incur a charge to Nightjar. If I previously verified with Didit, the provider may flag the new check as a duplicate.</span>
        </label>
        <button className="primary-button" type="button" disabled={pending || !permission || (!legalAccepted && !legalAcknowledged)}
          onClick={()=>void begin()}><LockKeyhole size={16} aria-hidden="true"/>{pending?'Preparing secure check…':'Start my one-time Didit ID check'}</button>
      </>}
      {launchUrl && <><a href={launchUrl} target="_blank" rel="noopener noreferrer" className="primary-button">
        <ExternalLink size={16} aria-hidden="true"/> Open secure Didit verification
      </a><p role="status"><strong>After Didit approves you:</strong> Return to this Nightjar tab. You can close the Didit tab manually; Nightjar will check your approval without starting another ID session. If your status has not updated yet, tap “Refresh verification status” below.</p></>}
      {!canStart && !launchUrl && <p><strong>Check already claimed.</strong> Nightjar will not start another paid session. Contact support if your verification link is missing.</p>}
      <p>Complete the check in Didit, return to Nightjar and tap Refresh verification status. An approved provider decision must be received and validated before you become Verified 18+.</p>
    </>}
    {!alreadyVerified && !canStart && <button className="primary-button" type="button" disabled={pending} onClick={()=>void recover()}>
      <ShieldCheck size={16} aria-hidden="true"/>{pending?'Checking completed Didit decision…':'Check my completed Didit result · no new ID check'}</button>}
    <button className="secondary-button" type="button" disabled={pending} onClick={()=>void refresh()}>
      <RefreshCw size={15} aria-hidden="true"/>{pending?'Checking…':'Refresh verification status'}</button>
    {error && <p className="nj-didit-reuse-error" role="alert">{error}</p>}
    {message && <p className="nj-didit-reuse-message" role="status">{message}</p>}
    <small>This verification is restricted to your authenticated Nightjar account. The older verification route stays paused; this replacement is user-initiated and cannot automatically create a second session.</small>
  </section>;
}
