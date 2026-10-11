import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, CircleHelp, Clock3, KeyRound, LifeBuoy, LockKeyhole, Mail, RefreshCw, Search, ShieldAlert, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { nightjarAssistance, type AccountAssistanceResult } from '../platform/firebase-account-assistance';

type Props = {
  onPeople: () => void;
  onSafety: () => void;
  onMail: () => void;
};

const labelError = (code:string) => {
  if (code === 'auth/invalid-credential') return 'Email or password not accepted; this may be a forgotten password or a typing error.';
  if (code === 'auth/too-many-requests') return 'Firebase reported too many attempts; the provider may temporarily limit sign-ins.';
  if (code === 'closed_beta_not_invited') return 'Attempt denied because this email was not on the closed-beta allowlist.';
  if (code === 'auth/user-disabled') return 'Firebase disabled this account.';
  if (code === 'auth/invalid-email') return 'The email entered was invalid.';
  return 'Nightjar recorded a failed or blocked sign-in. Check the detail before taking action.';
};
const readableTime = (value:string|null|undefined) => {
  if (!value) return 'Not available';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Not available':date.toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'});
};

export default function AdminAssistance({onPeople,onSafety,onMail}:Props) {
  const [email,setEmail]=useState('');
  const [account,setAccount]=useState<AccountAssistanceResult|null>(null);
  const [busy,setBusy]=useState(false);
  const [sending,setSending]=useState<'password_reset'|'email_verification'|null>(null);
  const [error,setError]=useState('');
  const [feedback,setFeedback]=useState('');
  const [reason,setReason]=useState('');
  const [requested,setRequested]=useState(false);

  const lookup = async (address = email) => {
    const cleaned=address.trim();
    if (!cleaned) return;
    setBusy(true);setError('');setFeedback('');setAccount(null);setRequested(false);
    try { setAccount(await nightjarAssistance.lookup(cleaned)); }
    catch(e) { setError(e instanceof Error?e.message:'Account lookup was unsuccessful.'); }
    finally {setBusy(false);}
  };
  const onSubmit = (event:FormEvent) => {event.preventDefault();void lookup();};
  const send = async (kind:'password_reset'|'email_verification') => {
    if (!account?.found || !account.email || reason.trim().length<12 || !requested) return;
    if (!window.confirm('Send one secure '+(kind==='password_reset'?'password reset':'email verification')+' email to '+account.email+'? The person must complete the action themselves. This will not unlock Firebase or sign anyone in.')) return;
    setSending(kind);setError('');setFeedback('');
    try {
      await nightjarAssistance.sendRecoveryEmail(account.email,kind,reason);
      setFeedback('Nightjar Mail sent a secure '+(kind==='password_reset'?'password-reset':'email-verification')+' link to the registered address. The member must open it and complete the process themselves.');
      setAccount(await nightjarAssistance.lookup(account.email));
      setReason('');setRequested(false);
    } catch(e) {setError(e instanceof Error?e.message:'Nightjar Mail could not send the recovery message.');}
    finally {setSending(null);}
  };
  const blocked = account?.found && (account.firebaseDisabled || account.nightjarStatus === 'suspended');
  const selfService = 'The user can also open Nightjar’s sign-in screen and choose “Forgot password”. If Firebase is temporarily rate-limiting attempts, resetting a password does not guarantee that its provider restriction is immediately cleared.';

  return <section className="nj-support-hub" aria-label="Nightjar administrator assistance">
    <div className="nj-support-intro">
      <span className="mini-label"><LifeBuoy size={15}/> ADMIN ASSISTANCE CENTRE</span>
      <h2>Help a member get back in.</h2>
      <p>Search for an existing Nightjar account, identify why their sign-in may be failing and send an audited recovery email when they request help.</p>
    </div>

    <form className="nj-support-search" onSubmit={onSubmit}>
      <label htmlFor="nj-support-account-email">Member's registered email address</label>
      <div className="nj-support-search-row">
        <input id="nj-support-account-email" type="email" required autoComplete="off" placeholder="member@example.com" value={email} onChange={e=>{setEmail(e.target.value);setAccount(null);setError('');setFeedback('');}}/>
        <button type="submit" className="primary-button" disabled={busy}>{busy?<RefreshCw size={16}/>:<Search size={16}/>} {busy?'Checking…':'Find account'}</button>
      </div>
    </form>
    {error && <p role="alert" className="nj-support-error">{error}</p>}
    {feedback && <p role="status" className="nj-support-feedback"><CheckCircle2 size={17}/>{feedback}</p>}

    {account && (!account.found ? <section className="nj-support-panel">
      <h3><CircleHelp size={19}/> Account not found</h3>
      <p>No Firebase account matched that address. It may be a typo, or the person may not have registered yet. Never use a failed attempt alone as proof of someone's identity.</p>
      <button type="button" className="secondary-button" onClick={onPeople}>Review approved beta testers <ArrowRight size={15}/></button>
    </section> : <>
      <section className="nj-support-panel">
        <div className="nj-support-panel-head"><h3><UserRoundCheck size={20}/> Account details</h3><button className="secondary-button" type="button" onClick={()=>void lookup(account.email)}><RefreshCw size={15}/> Refresh account</button></div>
        <div className="nj-support-person"><strong>{account.displayName||'Nightjar account'}</strong><span>{account.email}</span></div>
        <div className="nj-support-status-grid">
          <div><small>Nightjar profile</small><strong>{account.registered?'Registered':'Setup not completed'}</strong></div>
          <div><small>Email verification</small><strong>{account.emailVerified?'Verified':'Needs verification'}</strong></div>
          <div><small>Beta access</small><strong>{account.betaAllowed?'Permitted':'Not approved'}</strong></div>
          <div><small>Account security</small><strong>{account.firebaseDisabled?'Firebase disabled':account.nightjarStatus==='suspended'?'Nightjar suspended': 'No known account suspension'}</strong></div>
          <div><small>Last Firebase sign-in</small><strong>{readableTime(account.lastSignIn)}</strong></div>
          <div><small>Recent failures (15 min)</small><strong>{account.recentFailures??0}</strong></div>
        </div>
        <div className="nj-support-action-links">
          <button type="button" className="secondary-button" onClick={onPeople}>Manage roles, beta access and suspensions <ArrowRight size={15}/></button>
          <button type="button" className="secondary-button" onClick={onSafety}>Review security alerts <ArrowRight size={15}/></button>
        </div>
      </section>

      <section className="nj-support-panel">
        <h3><ShieldAlert size={19}/> Why can't they get in?</h3>
        {blocked && <p className="nj-support-issue">This account is disabled or suspended. Password reset will not restore access. Review the original moderation or administrator decision first.</p>}
        {!account.betaAllowed && <p className="nj-support-issue">Not approved for private beta. This can be reviewed under People; an email reset will not grant admission.</p>}
        {!account.emailVerified && <p className="nj-support-issue">Their email is not verified. Nightjar requires email verification before normal member access.</p>}
        {account.firebaseRateLimitObserved && <p className="nj-support-issue"><LockKeyhole size={16}/> Firebase reported rate limiting recently. Nightjar cannot forcibly clear Firebase's protection or promise a specific unlock time.</p>}
        {!blocked && account.betaAllowed && account.emailVerified && !account.firebaseRateLimitObserved && <p>The account appears eligible for Nightjar access. Check the recorded sign-in errors below; a forgotten password may be the issue.</p>}
        <p><strong>Lockout controls:</strong> Nightjar currently flags repeated failures but does not impose its own 24-hour password lock. The Firebase provider may apply temporary restrictions, and there is no supported administrator “skip password / unlock Firebase” switch.</p>
        <details className="nj-support-attempts">
          <summary>Recent failed sign-in records ({account.attempts.length})</summary>
          {account.attempts.length ? <div>{account.attempts.map(attempt=><article key={attempt.id}><strong>{readableTime(attempt.createdAt)}</strong><span>{labelError(attempt.reasonCode)}</span></article>)}</div> : <p>No matching failed sign-ins remain in the Nightjar account-portal records.</p>}
        </details>
      </section>

      <section className="nj-support-panel">
        <h3><KeyRound size={19}/> Recovery and assistance</h3>
        <p>Send a secure link only after the account holder has contacted you and asked for help. Nightjar will never reveal their password, change it on their behalf or log in as the member.</p>
        <label className="nj-support-reason-label" htmlFor="nj-support-reason">Reason / support case note</label>
        <textarea id="nj-support-reason" value={reason} onChange={e=>setReason(e.target.value)} rows={3} maxLength={360} placeholder="For example: Member contacted Nightjar Support about a forgotten password and requested a reset link."/>
        <label className="nj-support-checkbox"><input type="checkbox" checked={requested} onChange={e=>setRequested(e.target.checked)}/> <span>I confirm the actual account holder has requested assistance through a trusted support conversation.</span></label>
        <div className="nj-support-recovery-actions">
          <button type="button" className="primary-button" disabled={!account.canReset || sending!==null || reason.trim().length<12 || !requested} onClick={()=>void send('password_reset')}><KeyRound size={16}/> {sending==='password_reset'?'Sending…':'Send password reset link'}</button>
          <button type="button" className="secondary-button" disabled={!account.canVerify || sending!==null || reason.trim().length<12 || !requested} onClick={()=>void send('email_verification')}><Mail size={16}/> {sending==='email_verification'?'Sending…':'Resend verification email'}</button>
        </div>
        {account.administrator && <p className="nj-support-issue">Owner accounts cannot be reset through this member assistance tool. Administrators must use their own secure account recovery.</p>}
        <p className="nj-support-tip">{selfService}</p>
        <button type="button" className="ghost-button" onClick={onMail}>Nightjar Mail connection/settings <ArrowRight size={15}/></button>
      </section>

      <section className="nj-support-panel">
        <h3><Clock3 size={19}/> Assistance history</h3>
        {account.history.length ? <div className="nj-support-history">{account.history.map(action=><article key={action.id}>
          <span>{readableTime(action.createdAt)} · {action.status==='sent'? 'Email sent':'Delivery failed'}</span>
          <strong>{action.kind==='password_reset'?'Password-reset assistance':action.kind==='email_verification'?'Email-verification assistance':action.kind}</strong>
          <p>{action.note}</p>
          <small>Administrator: {action.by||'Nightjar owner'}</small>
        </article>)}</div>:<p>No previous recovery emails recorded for this account.</p>}
      </section>
    </>)}

    {!account && !busy && <section className="nj-support-panel nj-support-quick-guide"><h3><ShieldCheck size={19}/> What an administrator can do</h3>
      <p>Check account and tester status, identify common sign-in errors, send secure password-reset or verification links, inspect support history, and open permissions or security reviews. Firebase provider cooldowns and age assurance stay enforced.</p>
    </section>}
  </section>;
}
