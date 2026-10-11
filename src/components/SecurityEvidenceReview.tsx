import { AlertCircle, ArrowRight, CheckCircle2, Clock3, ExternalLink, LockKeyhole, Mail, Monitor, ShieldCheck, UserCircle2, X } from 'lucide-react';

type Evidence = {
  id?: string;
  eventType?: string;
  createdAt?: string | null;
  summary?: string | null;
  deviceId?: string | null;
  readerSessionId?: string | null;
  clientPlatform?: string | null;
  detectionSource?: string | null;
  detectionConfidence?: string | null;
  route?: string | null;
  relatedId?: string | null;
  visibilityState?: string | null;
};

type Target = {
  eligible: boolean;
  status: 'approved' | 'unapproved' | 'unverified' | 'unregistered';
  displayName: string | null;
  email: string | null;
  accessReason: string | null;
};

export type SecurityEvidenceReviewData = {
  alert: any;
  evidence: Evidence[];
  authorisedTarget?: Target | null;
};

type Props = { review: SecurityEvidenceReviewData; onClose: () => void };

const time = (value: unknown) => {
  if (!value) return 'Not recorded';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
};

const failureCode = (code: unknown) => {
  const value = String(code ?? '');
  if (value === 'auth/invalid-credential') return 'The email/password combination was not accepted. A mistyped or outdated password is possible.';
  if (value === 'auth/too-many-requests') return 'Firebase temporarily restricted repeated authentication requests.';
  if (value === 'closed_beta_not_invited') return 'This email does not currently have permission to enter the private beta.';
  if (value === 'auth/user-disabled') return 'Firebase rejected the sign-in because the account is disabled.';
  if (value === 'auth/invalid-email') return 'The email address entered was not valid.';
  return 'Nightjar observed an unsuccessful or blocked authentication request.';
};

const eventLabel = (event: Evidence) => {
  if (event.eventType === 'signin_failed') return 'Unsuccessful sign-in';
  if (event.eventType === 'closed_beta_signin_denied') return 'Private-beta access denied';
  if (event.eventType === 'possible_screenshot_key') return 'Possible screenshot shortcut';
  if (event.eventType === 'native_screenshot_detected') return 'Native screenshot signal';
  if (event.eventType === 'print_blocked') return 'Blocked print command';
  return String(event.eventType ?? 'Recorded interaction').replaceAll('_', ' ');
};

const shortDevice = (value: unknown) => {
  const str = String(value ?? '');
  return str ? str.slice(0, 6) + '…' : 'Not recorded';
};

export default function SecurityEvidenceReview({ review, onClose }: Props) {
  const { alert, evidence, authorisedTarget } = review;
  const isAuthentication = alert?.category === 'authentication';
  const signal = alert?.signal ?? {};
  const email = authorisedTarget?.eligible ? authorisedTarget.email : null;
  const name = authorisedTarget?.eligible ? authorisedTarget.displayName : null;
  const helpSubject = encodeURIComponent('Nightjar — can we help you sign in?');
  const helpBody = encodeURIComponent(`Hello,\n\nWe noticed some unsuccessful sign-in attempts referencing your Nightjar account. Was this you, and are you having trouble accessing Nightjar? We'd be happy to help.\n\nPlease do not send your password, ID documents or verification codes by email.\n\nKind regards,\nNightjar Support`);
  const helpLink = email ? `mailto:${email}?subject=${helpSubject}&body=${helpBody}` : null;
  const signalCode = signal.firebaseCode;
  const distinctTokens = new Set(evidence.map(event => event.deviceId).filter(Boolean)).size;

  return <div className="security-evidence-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="security-evidence-modal nj-evidence-review" role="dialog" aria-modal="true" aria-labelledby="nj-evidence-title">
      <header className="security-evidence-head">
        <div><span className="mini-label">NIGHTJAR / SECURITY REVIEW</span><h2 id="nj-evidence-title">{isAuthentication ? 'Sign-in trouble detected' : 'Security event review'}</h2>
          <p>{isAuthentication ? 'Find out which account was targeted, what went wrong and whether a genuine member needs help.' : 'Review the observed activity before deciding whether any action is needed.'}</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close security evidence review"><X size={20}/></button>
      </header>

      <div className="nj-evidence-summary">
        <div className="nj-evidence-risk"><AlertCircle size={18}/><span><strong>{String(alert?.severity ?? 'medium').toUpperCase()} PRIORITY</strong><small>Risk score {alert?.riskScore ?? '—'} · Human review only</small></span></div>
        <div className="nj-evidence-facts">
          <div><Clock3 size={16}/><span><small>Alert created</small><strong>{time(alert?.createdAt)}</strong></span></div>
          <div><Monitor size={16}/><span><small>Evidence</small><strong>{evidence.length} recorded event{evidence.length === 1 ? '' : 's'}</strong></span></div>
        </div>

        {isAuthentication ? <>
          <section className="nj-evidence-question" aria-labelledby="nj-evidence-who">
            <div className="nj-evidence-question-heading"><UserCircle2 size={20}/><h3 id="nj-evidence-who">Whose account was targeted?</h3></div>
            {email && name ? <>
              <div className="nj-evidence-contact">
                <div><strong>{name}</strong><span>{email}</span><small><CheckCircle2 size={14}/> Registered, email-verified and authorised for Nightjar access</small></div>
                {helpLink && <a className="primary-button nj-evidence-contact-action" href={helpLink}><Mail size={16}/> Contact to offer help <ExternalLink size={14}/></a>}
              </div>
            </> : <>
              <p className="nj-evidence-target">{alert?.targetEmailMasked || 'Unidentified account'}</p>
              <p>{authorisedTarget?.status === 'unverified' ? 'The matched account is not email-verified, so direct member outreach is unavailable.' : authorisedTarget?.status === 'unapproved' ? 'This account is not currently authorised for Nightjar access. No personal contact details are exposed.' : 'No currently authorised, verified Nightjar account was matched to this target. Contact information is not available.'}</p>
            </>}
            <p className="nj-evidence-caution"><LockKeyhole size={15}/> This identifies the <strong>account being targeted</strong>, not the person who entered the credentials. A browser token cannot establish someone's identity.</p>
          </section>

          <section className="nj-evidence-question" aria-labelledby="nj-evidence-why">
            <div className="nj-evidence-question-heading"><AlertCircle size={20}/><h3 id="nj-evidence-why">Why was this flagged?</h3></div>
            <p>{Number(signal.failedAttempts15m) > 0 ? `${signal.failedAttempts15m} unsuccessful or blocked attempts were recorded for this account within 15 minutes when the alert was created.` : (alert?.reason || 'Nightjar detected unusual unsuccessful sign-in activity.')}</p>
            <p>{failureCode(signalCode)}</p>
            <div className="nj-evidence-outcome"><ShieldCheck size={16}/><span>These events describe rejected or blocked sign-ins. They do not establish whether the account holder made the attempts or whether any separate sign-in succeeded.</span></div>
          </section>
        </> : <>
          <section className="nj-evidence-question"><div className="nj-evidence-question-heading"><UserCircle2 size={20}/><h3>Account and activity</h3></div><p><strong>{alert?.userName ?? 'Nightjar account'}</strong>{alert?.userHandle ? ' · @' + alert.userHandle : ''}</p><p>{alert?.reason || 'Protected content activity requires review.'}</p><p className="nj-evidence-caution"><ShieldCheck size={15}/> Browser shortcuts are possible signals only. Do not treat them as proof that content was captured.</p></section>
        </>}
        <details className="nj-evidence-technical">
          <summary>Technical evidence <span>{evidence.length} events <ArrowRight size={16}/></span></summary>
          <p>Evidence is retained for contextual review, not definitive identification. {isAuthentication ? `Recorded browser tokens: ${distinctTokens}. These tokens are not verified people or IP addresses.` : 'Device signals and browser events can be incomplete.'}</p>
          {evidence.length ? <div className="security-evidence-list">
            {evidence.map((event, index) => <article key={event.id ?? index} className="security-evidence-row">
              <div className="security-evidence-row-head"><strong>{eventLabel(event)}</strong><span>{time(event.createdAt)}</span></div>
              <p>{isAuthentication ? (event.summary || 'Failed or blocked sign-in logged by the Nightjar account portal.') : (event.summary || 'Nightjar protected activity event.')}</p>
              <dl>
                <div><dt>Browser/device token</dt><dd>{shortDevice(event.deviceId)} (not personal identity)</dd></div>
                <div><dt>Platform</dt><dd>{event.clientPlatform ?? 'Not available'}</dd></div>
                <div><dt>Source</dt><dd>{event.detectionSource ?? 'Not available'}</dd></div>
                <div><dt>Route</dt><dd>{event.route ?? 'Not available'}</dd></div>
                {!isAuthentication && <>
                  <div><dt>Content identifier</dt><dd>{event.relatedId ?? '—'}</dd></div>
                  <div><dt>Reader session</dt><dd>{event.readerSessionId ?? '—'}</dd></div>
                  <div><dt>Evidence confidence</dt><dd>{event.detectionConfidence ?? 'Not recorded'}</dd></div>
                  <div><dt>Visibility</dt><dd>{event.visibilityState ?? 'Not recorded'}</dd></div>
                </>}
              </dl>
            </article>)}
          </div> : <p>No supporting events were returned for this alert.</p>}
        </details>
      </div>
    </section>
  </div>;
}
