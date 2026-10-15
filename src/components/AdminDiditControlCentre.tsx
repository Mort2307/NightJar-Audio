import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, CircleHelp, ExternalLink, Fingerprint, RefreshCw, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { nightjarAge, type AgeStatus, type DiditDiagnostics } from '../platform/firebase-age';

const diditSteps = [
  { key:'session', label:'Nightjar created and linked the Didit session' },
  { key:'receipt', label:'Nightjar received a signed Didit decision webhook' },
  { key:'processing', label:'Nightjar processed the webhook' },
  { key:'evidence', label:'The signed result contained acceptable 18+ evidence' },
  { key:'account', label:'This Nightjar account is permanently verified 18+' },
] as const;

const stateExplanation: Record<DiditDiagnostics['outcome'], string> = {
  verified: 'Nightjar has securely recorded a live 18+ verification. No repeat identity check is required.',
  no_account_session: 'No Didit session is linked to this account. Check the Didit provider session and the session-creation logs; do not create another paid check.',
  session_binding_missing: 'Nightjar has a session reference but its stored account binding could not be verified. Check Firestore diditSessions and the backend logs.',
  awaiting_signed_webhook: 'The session is linked, but no accepted signed status/data webhook receipt was found for it. Check Didit webhooks and the live endpoint.',
  webhook_waiting_for_processing: 'The signed webhook reached Nightjar, but the background processor has not recorded completion. Check processDiditWebhook logs and retries.',
  webhook_ignored_or_superseded: 'A webhook was recorded but ignored or superseded. Check the session/account binding, workflow and event ordering in server logs.',
  adult_evidence_missing: 'Didit sent Approved, but the signed payload did not satisfy Nightjar’s 18+ evidence check. Review the configured workflow and webhook fields.',
  provider_result_not_verified: 'A provider event was processed, but Nightjar cannot grant a verified-adult result from it. Review the event decision and account state.',
};

type StepKey = typeof diditSteps[number]['key'];

export default function AdminDiditControlCentre() {
  const [status, setStatus] = useState<AgeStatus | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiditDiagnostics | null>(null);
  const [checking, setChecking] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [diagnosticsError, setDiagnosticsError] = useState('');
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const refresh = async () => {
    setChecking(true);
    setStatusError('');
    setDiagnosticsError('');
    const [current, trail] = await Promise.allSettled([
      nightjarAge.status(),
      nightjarAge.adminDiagnostics(),
    ]);
    if (current.status === 'fulfilled') setStatus(current.value);
    else {
      setStatus(null);
      setStatusError('Nightjar could not read the account verification result. Check your connection and retry; do not start another ID check.');
    }
    if (trail.status === 'fulfilled') setDiagnostics(trail.value);
    else {
      setDiagnostics(null);
      setDiagnosticsError('Diagnostic function unavailable. The read-only adminDiditDiagnostics backend may still need deploying, or your administrator session may need refreshing.');
    }
    setCheckedAt(new Date().toISOString());
    setChecking(false);
  };

  useEffect(() => { void refresh(); }, []);

  const verified = status?.providerVerified === true && status.reverifyRequired !== true
    && status.provider === 'didit' && status.environment === 'live';
  const received = diagnostics?.signedWebhookReceived === true;
  const processed = diagnostics?.webhookProcessed === true && diagnostics.webhookIgnored !== true;
  const steps: Record<StepKey, boolean | null> = {
    session: diagnostics ? diagnostics.sessionRecorded && diagnostics.sessionBound : null,
    receipt: diagnostics ? received : null,
    processing: diagnostics ? processed : null,
    evidence: diagnostics ? processed && diagnostics.adultEvidenceConfirmed : null,
    account: status ? verified : null,
  };
  const title = verified ? 'VERIFIED 18+'
    : !status ? 'Unable to confirm verification'
    : status.providerStatus === 'PENDING_REVIEW' || status.reverifyRequired
      ? 'Verification needs review'
      : status.controlledAdminTestClaimed || diagnostics?.oneShotClaimed || status.sessionActive
        ? 'Awaiting Nightjar confirmation'
        : 'No verified Didit result';
  const description = verified
    ? 'Nightjar has saved a live, server-accepted Didit adult verification for this account. You are not required to repeat the ID check.'
    : !status
      ? 'The account could not be checked. The single paid test remains locked; use Refresh result only.'
      : status.controlledAdminTestClaimed || diagnostics?.oneShotClaimed
        ? 'The one-time test was claimed, but that does NOT confirm an accepted age result. Use the evidence trail to locate where it stopped.'
        : 'Temporary private-beta access is separate from a live verified Didit result.';
  const latestOutcome = diagnostics ? stateExplanation[diagnostics.outcome] : 'Read-only integration diagnostics will appear when the protected endpoint is deployed and reachable.';

  return <section className="nj-didit-control" aria-label="Didit verification control centre">
    <div className="nj-didit-control-hero">
      <div className="nj-didit-control-head">
        <span className="nj-didit-control-emblem"><Fingerprint size={23} aria-hidden="true"/></span>
        <div><span className="mini-label">DIDIT · VERIFICATION CONTROL CENTRE</span><h2>Follow the verification, not just the test.</h2></div>
      </div>
      <div className={`nj-didit-verdict ${verified ? 'verified' : status ? 'attention' : 'unknown'}`} role="status" aria-live="polite">
        {verified ? <CheckCircle2 size={29} aria-hidden="true"/> : status ? <ShieldAlert size={29} aria-hidden="true"/> : <CircleHelp size={29} aria-hidden="true"/>}
        <div><strong>{title}</strong><p>{description}</p></div>
      </div>
      <div className="nj-didit-control-facts">
        <span><small>Nightjar provider status</small><strong>{status ? String(status.providerStatus ?? status.status ?? 'NOT_STARTED').replaceAll('_',' ') : 'Not available'}</strong></span>
        <span><small>One-time test</small><strong>{diagnostics?.oneShotClaimed || status?.controlledAdminTestClaimed ? 'Claimed · no retries' : 'Not claimed / unknown'}</strong></span>
        <span><small>Didit environment</small><strong>{status ? status.environment === 'live' ? 'Live' : 'Sandbox / unconfigured' : 'Unknown'}</strong></span>
        <span><small>Public verification</small><strong>{status?.verificationPaused !== false ? 'Paused · protected' : 'Backend reports enabled'}</strong></span>
        {verified && status?.verifiedAt && <span><small>Verified date</small><strong>{new Date(status.verifiedAt).toLocaleString('en-GB')}</strong></span>}
      </div>
      <div className="nj-didit-control-actions">
        <button type="button" className="primary-button" disabled={checking} onClick={() => void refresh()}>
          <RefreshCw size={16} aria-hidden="true"/>{checking ? 'Checking Nightjar…' : 'Refresh verification result · no paid check'}
        </button>
        <a className="secondary-button" href="https://business.didit.me/sign-in" target="_blank" rel="noopener noreferrer">
          Didit Business Console <ExternalLink size={15} aria-hidden="true"/>
        </a>
      </div>
      {(statusError || diagnosticsError) && <div className="nj-didit-control-errors" role="alert">{statusError && <p>{statusError}</p>}{diagnosticsError && <p>{diagnosticsError}</p>}</div>}
      <small>{checkedAt ? 'Last checked: ' + new Date(checkedAt).toLocaleString('en-GB') : 'Checking Nightjar…'} · This panel reads saved verification records only and does not contact Didit to create a session.</small>
    </div>
    <section className="nj-didit-control-evidence" aria-label="Didit verification evidence trail">
      <div className="nj-didit-control-evidence-title"><span className="mini-label">INTEGRATION DIAGNOSTICS · READ ONLY</span><h3>Where did the data gremlins stop?</h3><p>All steps must be confirmed before Nightjar displays a verified-adult result. Unknown is not the same as passed.</p></div>
      <div className="nj-didit-control-steps">
        {diditSteps.map(({key,label},i) => {
          const result=steps[key];
          return <div className="nj-didit-control-step" key={key}>
            <span className={result === true ? 'done' : result === false ? 'waiting' : 'unknown'}>{result === true ? <CheckCircle2 size={19}/> : result === false ? <XCircle size={19}/> : <CircleHelp size={19}/>}</span>
            <div><small>Step {i + 1}</small><strong>{label}</strong></div>
            <em>{result === true ? 'CONFIRMED' : result === false ? 'NOT CONFIRMED' : 'UNKNOWN'}</em>
          </div>;
        })}
      </div>
      <div className="nj-didit-control-diagnosis">
        <strong>Current finding</strong><p>{latestOutcome}</p>
        {diagnostics?.webhookStatus && <small>Last signed Didit status: {diagnostics.webhookStatus}{diagnostics.lastWebhookReceivedAt ? ' · Received ' + new Date(diagnostics.lastWebhookReceivedAt).toLocaleString('en-GB') : ''}</small>}
      </div>
      <div className="nj-didit-control-links">
        <a href="https://business.didit.me/sign-in" target="_blank" rel="noopener noreferrer">Didit verification sessions / webhooks <ArrowRight size={14}/></a>
        <a href="https://console.cloud.google.com/logs/query?project=nightjar-audio" target="_blank" rel="noopener noreferrer">Google Cloud function logs <ArrowRight size={14}/></a>
        <a href="https://console.firebase.google.com/project/nightjar-audio/firestore" target="_blank" rel="noopener noreferrer">Firebase account and event records <ArrowRight size={14}/></a>
      </div>
      <p className="nj-didit-control-footnote"><ShieldCheck size={15}/> Live verification stays paused until the result, webhook binding, under-18 rejection, persistence, and security checks have been separately validated. A green account result alone does not authorise public launch.</p>
    </section>
  </section>;
}
