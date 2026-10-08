import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Mail, RefreshCw, Send, ShieldCheck, Users } from 'lucide-react';
import {
  nightjarAdministration,
  type AdminEmailAudience,
  type AdminEmailAudiencePreview,
  type AdminEmailCampaign,
  type AdminEmailCategory,
} from '../platform/firebase-administration';

const AUDIENCES: { value: AdminEmailAudience; label: string; detail: string }[] = [
  { value: 'all_testers', label: 'Founding / private-beta testers', detail: 'Includes approved tester emails even before they create a Nightjar account.' },
  { value: 'all_professionals', label: 'All professional creators', detail: 'Every active VA Creator, Writer, Audio Editor and Artist account.' },
  { value: 'creator', label: 'VA Creators', detail: 'Active accounts approved as VA Creators.' },
  { value: 'writer', label: 'Writers', detail: 'Active accounts approved as Writers.' },
  { value: 'editor', label: 'Audio Editors', detail: 'Active accounts approved as Audio Editors.' },
  { value: 'artist', label: 'Artists', detail: 'Active accounts approved as Artists.' },
  { value: 'all_members', label: 'All active members', detail: 'All non-suspended, non-admin Nightjar accounts.' },
];

const CATEGORIES: { value: AdminEmailCategory; label: string; detail: string }[] = [
  { value: 'testing_update', label: 'Private testing update', detail: 'Tester access, onboarding, profile setup and beta information.' },
  { value: 'creator_operations', label: 'Creator operations', detail: 'Creator participation, releases, collaboration and platform operations.' },
  { value: 'account_service', label: 'Account / service', detail: 'Account, security or essential service information.' },
];

const cleanError = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? 'Something went wrong.');
  return raw
    .replace(/^Firebase:\s*/i, '')
    .replace(/^Functions:\s*/i, '')
    .replace(/\s*\([^)]*\/[^)]*\)\.?$/i, '')
    .trim();
};

const campaignStatusLabel = (campaign: AdminEmailCampaign) => {
  if (campaign.status === 'completed') return 'Complete';
  if (campaign.status === 'partial_failure') return 'Partial failure';
  if (campaign.status === 'failed') return 'Failed';
  if (campaign.status === 'retrying') return 'Retrying';
  if (campaign.status === 'sending') return 'Sending';
  return campaign.status || 'Unknown';
};

export default function AdminCommunications() {
  const [audience, setAudience] = useState<AdminEmailAudience>('all_testers');
  const [category, setCategory] = useState<AdminEmailCategory>('testing_update');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState<AdminEmailAudiencePreview | null>(null);
  const [campaigns, setCampaigns] = useState<AdminEmailCampaign[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [manualTestEmails, setManualTestEmails] = useState('');
  const [manualTestStatus, setManualTestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [manualTestMessage, setManualTestMessage] = useState('');
  const [manualTestResults, setManualTestResults] = useState<{ email: string; status: 'sent' | 'failed'; error?: string }[]>([]);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [retryingCampaignId, setRetryingCampaignId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const selectedAudience = useMemo(
    () => AUDIENCES.find((item) => item.value === audience) ?? AUDIENCES[0],
    [audience],
  );
  const selectedCategory = useMemo(
    () => CATEGORIES.find((item) => item.value === category) ?? CATEGORIES[0],
    [category],
  );
  const parsedManualTestEmails = useMemo(
    () => Array.from(new Set(
      manualTestEmails
        .split(/[\n,;]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    )),
    [manualTestEmails],
  );
  const invalidManualTestEmails = useMemo(
    () => parsedManualTestEmails.filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
    [parsedManualTestEmails],
  );

  const refreshPreview = async (nextAudience = audience) => {
    setLoadingPreview(true);
    try {
      setPreview(await nightjarAdministration.emailAudiencePreview(nextAudience));
    } catch (error) {
      setPreview(null);
      setNotice({ kind: 'error', text: cleanError(error) });
    } finally {
      setLoadingPreview(false);
    }
  };

  const refreshCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const result = await nightjarAdministration.emailCampaigns();
      setCampaigns(result.campaigns ?? []);
    } catch (error) {
      setNotice({ kind: 'error', text: cleanError(error) });
    } finally {
      setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    void refreshPreview(audience);
    setConfirmed(false);
  }, [audience]);

  useEffect(() => {
    void refreshCampaigns();
  }, []);

  const sendTest = async (recipientEmails: string[] = []) => {
    if (!subject.trim() || !body.trim()) {
      const message = 'Add a subject and message before sending a test.';
      setNotice({ kind: 'error', text: message });
      if (recipientEmails.length) {
        setManualTestStatus('error');
        setManualTestMessage(message);
      }
      return;
    }
    if (recipientEmails.length > 10) {
      const message = 'Use no more than 10 manual test email addresses at once.';
      setNotice({ kind: 'error', text: message });
      setManualTestStatus('error');
      setManualTestMessage(message);
      return;
    }
    if (recipientEmails.length && invalidManualTestEmails.length) {
      const message = 'Fix the invalid manual test email address before sending.';
      setNotice({ kind: 'error', text: message });
      setManualTestStatus('error');
      setManualTestMessage(message);
      return;
    }

    setSendingTest(true);
    setNotice(null);
    if (recipientEmails.length) {
      setManualTestStatus('sending');
      setManualTestMessage(`Connecting to Nightjar Mail and sending ${recipientEmails.length} private test email${recipientEmails.length === 1 ? '' : 's'}…`);
      setManualTestResults([]);
    }

    try {
      const result = await nightjarAdministration.sendEmailTest(
        subject.trim(),
        body.trim(),
        category,
        recipientEmails,
      );

      const message = result.failedCount
        ? `Test delivery finished: ${result.sentCount} sent, ${result.failedCount} failed. No live audience recipients were contacted.`
        : recipientEmails.length
          ? `${result.sentCount} separate private test email${result.sentCount === 1 ? '' : 's'} sent successfully. No live audience recipients were contacted.`
          : `Private test email sent to ${result.recipientEmail}. No live audience recipients were contacted.`;

      setNotice({ kind: result.failedCount ? 'error' : 'success', text: message });

      if (recipientEmails.length) {
        setManualTestResults(result.results ?? []);
        setManualTestStatus(result.failedCount ? 'error' : 'success');
        setManualTestMessage(message);
      }
    } catch (error) {
      const message = cleanError(error) || 'Nightjar Mail test failed before a delivery result was returned.';
      setNotice({ kind: 'error', text: message });
      if (recipientEmails.length) {
        setManualTestStatus('error');
        setManualTestMessage(message);
        setManualTestResults([]);
      }
    } finally {
      setSendingTest(false);
    }
  };

  const sendCampaign = async () => {
    if (!subject.trim() || !body.trim() || !confirmed || !preview?.recipientCount || preview.overSendLimit) return;
    setSendingCampaign(true);
    setNotice(null);
    try {
      const result = await nightjarAdministration.sendEmailCampaign({
        subject: subject.trim(),
        body: body.trim(),
        audience,
        category,
        clientRequestId: crypto.randomUUID(),
        confirmPrivateIndividualDelivery: true,
      });
      const campaign = result.campaign;
      setNotice({
        kind: campaign.failedCount
          ? 'error'
          : 'success',
        text: campaign.failedCount
          ? `Campaign finished: ${campaign.sentCount} sent, ${campaign.failedCount} failed. Failed deliveries can be retried below.`
          : `${campaign.sentCount} separate private email${campaign.sentCount === 1 ? '' : 's'} sent successfully.`,
      });
      setConfirmed(false);
      await Promise.all([refreshPreview(audience), refreshCampaigns()]);
    } catch (error) {
      setNotice({ kind: 'error', text: cleanError(error) });
    } finally {
      setSendingCampaign(false);
    }
  };

  const retryCampaign = async (campaignId: string) => {
    setRetryingCampaignId(campaignId);
    setNotice(null);
    try {
      const result = await nightjarAdministration.retryEmailCampaign(campaignId);
      setNotice({
        kind: result.stillFailed
          ? 'error'
          : 'success',
        text: result.retried
          ? `Retry complete: ${result.recovered ?? 0} recovered, ${result.stillFailed ?? 0} still failed.`
          : 'There were no failed deliveries left to retry.',
      });
      await refreshCampaigns();
    } catch (error) {
      setNotice({ kind: 'error', text: cleanError(error) });
    } finally {
      setRetryingCampaignId(null);
    }
  };

  const sendDisabled = !subject.trim()
    || !body.trim()
    || !confirmed
    || !preview?.recipientCount
    || preview.overSendLimit
    || sendingCampaign;

  return (
    <section className="admin-communications">
      <div className="admin-communications-head">
        <div>
          <span className="mini-label">COMMUNICATIONS · PRIVATE DELIVERY</span>
          <h2>Nightjar Mail</h2>
          <p>
            Send one independently addressed message per recipient. Nightjar never creates a group To list,
            CC list or BCC broadcast for these campaigns.
          </p>
        </div>
        <div className="admin-mail-privacy-badge">
          <ShieldCheck size={17} />
          <div><strong>Nightjar → one user</strong><span>One SMTP transaction and one To address per person</span></div>
        </div>
      </div>

      {notice && (
        <div className={notice.kind === 'success' ? 'admin-mail-notice success' : 'admin-mail-notice error'}>
          {notice.kind === 'success' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
          <span>{notice.text}</span>
        </div>
      )}

      <div className="admin-mail-layout">
        <div className="admin-mail-composer">
          <div className="admin-mail-form-grid">
            <label>
              Audience
              <select
                value={audience}
                onChange={(event) => setAudience(event.target.value as AdminEmailAudience)}
                disabled={sendingCampaign}
              >
                {AUDIENCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <small>{selectedAudience.detail}</small>
            </label>

            <label>
              Communication type
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as AdminEmailCategory)}
                disabled={sendingCampaign}
              >
                {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <small>{selectedCategory.detail}</small>
            </label>
          </div>

          <div className="admin-mail-policy-note">
            <ShieldCheck size={15} />
            <span><strong>Operational email only for now.</strong> Promotional marketing is intentionally disabled until Nightjar's consent, preference and unsubscribe controls are live.</span>
          </div>

          <label className="admin-mail-field">
            Subject
            <input
              value={subject}
              maxLength={180}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Welcome to Nightjar 🌙"
              disabled={sendingCampaign}
            />
          </label>

          <label className="admin-mail-field">
            Message
            <textarea
              value={body}
              maxLength={12000}
              rows={12}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write the message exactly as you want each recipient to receive it…"
              disabled={sendingCampaign}
            />
          </label>

          <div className="admin-mail-token-row">
            <span>Personalisation:</span>
            <code>{'{{firstName}}'}</code>
            <code>{'{{displayName}}'}</code>
            <code>{'{{role}}'}</code>
            <small>Optional. Nightjar resolves these separately for each delivery.</small>
          </div>

          <div className="admin-mail-manual-test">
            <div className="admin-mail-manual-test-head">
              <div>
                <span className="mini-label">TEST DELIVERY ONLY</span>
                <strong>Manual test recipients</strong>
                <small>Enter your own test inboxes one per line. These addresses are completely separate from the live audience above.</small>
              </div>
              <span className="status-pill muted">{parsedManualTestEmails.length}/10</span>
            </div>
            <textarea
              value={manualTestEmails}
              rows={4}
              onChange={(event) => {
                setManualTestEmails(event.target.value);
                setManualTestStatus('idle');
                setManualTestMessage('');
                setManualTestResults([]);
              }}
              placeholder={"mike-test@example.com\nmeg-test@example.com\nanother-inbox@example.com"}
              disabled={sendingTest || sendingCampaign}
              aria-label="Manual test email recipients"
            />
            {invalidManualTestEmails.length > 0 && (
              <div className="admin-mail-test-validation">
                <AlertTriangle size={14} />
                <span>Invalid: {invalidManualTestEmails.join(', ')}</span>
              </div>
            )}
            <div className="admin-mail-test-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => void sendTest()}
                disabled={!subject.trim() || !body.trim() || sendingTest || sendingCampaign}
              >
                <Mail size={15} /> {sendingTest ? 'Sending test…' : 'Send test to me'}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void sendTest(parsedManualTestEmails)}
                disabled={
                  !subject.trim()
                  || !body.trim()
                  || sendingTest
                  || sendingCampaign
                  || parsedManualTestEmails.length === 0
                  || parsedManualTestEmails.length > 10
                  || invalidManualTestEmails.length > 0
                }
              >
                <Send size={15} /> {sendingTest ? 'Sending tests…' : `Send ${parsedManualTestEmails.length || ''} manual test${parsedManualTestEmails.length === 1 ? '' : 's'}`}
              </button>
            </div>
            {manualTestStatus !== 'idle' && (
              <div className={manualTestStatus === 'success' ? 'admin-mail-manual-status success' : manualTestStatus === 'error' ? 'admin-mail-manual-status error' : 'admin-mail-manual-status sending'}>
                {manualTestStatus === 'sending'
                  ? <RefreshCw className="admin-mail-spin" size={15} />
                  : manualTestStatus === 'success'
                    ? <CheckCircle2 size={15} />
                    : <AlertTriangle size={15} />}
                <div>
                  <strong>{manualTestStatus === 'sending' ? 'Sending manual tests' : manualTestStatus === 'success' ? 'Manual test complete' : 'Manual test needs attention'}</strong>
                  <span>{manualTestMessage}</span>
                </div>
              </div>
            )}
            {manualTestResults.length > 0 && (
              <div className="admin-mail-manual-results">
                {manualTestResults.map((result) => (
                  <div key={result.email} className={result.status === 'sent' ? 'sent' : 'failed'}>
                    {result.status === 'sent' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    <div>
                      <strong>{result.email}</strong>
                      <span>{result.status === 'sent' ? 'Sent as an independent private message.' : result.error || 'Delivery failed.'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <small className="admin-mail-test-safety">Each address gets its own SMTP message with exactly one To recipient. Manual test addresses are never added to your Nightjar member or tester audience.</small>
          </div>

          <div className="admin-mail-delivery-confirm">
            <input
              id="admin-mail-private-confirm"
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={sendingCampaign}
            />
            <label htmlFor="admin-mail-private-confirm">
              <strong>I confirm this should send as separate private emails.</strong>
              <span>No recipient will be placed in another recipient's To, CC or BCC fields.</span>
            </label>
          </div>

          <div className="admin-mail-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => void sendCampaign()}
              disabled={sendDisabled}
            >
              <Send size={15} /> {sendingCampaign ? 'Sending private emails…' : `Send ${preview?.recipientCount ?? 0} separate live emails`}
            </button>
          </div>
        </div>

        <aside className="admin-mail-audience">
          <div className="admin-mail-audience-title">
            <div><span className="mini-label">LIVE AUDIENCE</span><h3>{preview?.audienceLabel ?? selectedAudience.label}</h3></div>
            <button className="icon-button" type="button" onClick={() => void refreshPreview()} disabled={loadingPreview} aria-label="Refresh email audience">
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="admin-mail-recipient-count">
            <Users size={18} />
            <strong>{loadingPreview ? '…' : preview?.recipientCount ?? 0}</strong>
            <span>private deliveries</span>
          </div>

          {preview?.overSendLimit && (
            <div className="admin-mail-limit-warning">
              <AlertTriangle size={16} />
              <span>This audience exceeds the current {preview.sendLimit}-message SMTP safety limit. Nothing will send until the audience is reduced or the delivery layer is scaled.</span>
            </div>
          )}

          <div className="admin-mail-recipient-list">
            {(preview?.recipients ?? []).slice(0, 12).map((recipient) => (
              <div key={recipient.email} className="admin-mail-recipient">
                <span>{recipient.displayName.slice(0, 1).toUpperCase()}</span>
                <div><strong>{recipient.displayName}</strong><small>{recipient.email} · {recipient.roleLabel}</small></div>
              </div>
            ))}
            {!loadingPreview && !preview?.recipientCount && (
              <div className="people-empty"><Mail size={17} /><strong>No deliverable recipients yet</strong><span>Nightjar will not send an empty campaign.</span></div>
            )}
            {(preview?.recipientCount ?? 0) > 12 && (
              <small className="admin-mail-more">+{(preview?.recipientCount ?? 0) - 12} more recipients resolved privately by the backend.</small>
            )}
          </div>
        </aside>
      </div>

      <div className="admin-mail-history">
        <div className="admin-mail-history-head">
          <div><span className="mini-label">DELIVERY LEDGER</span><h3>Recent campaigns</h3></div>
          <button className="secondary-button" type="button" onClick={() => void refreshCampaigns()} disabled={loadingCampaigns}>
            <RefreshCw size={14} /> {loadingCampaigns ? 'Refreshing…' : 'Refresh history'}
          </button>
        </div>

        {campaigns.length === 0 ? (
          <div className="people-empty"><Mail size={18} /><strong>No Nightjar campaigns sent yet</strong><span>Sent campaigns and delivery failures will appear here.</span></div>
        ) : (
          <div className="admin-mail-campaign-list">
            {campaigns.map((campaign) => (
              <article className="admin-mail-campaign" key={campaign.id}>
                <div>
                  <strong>{campaign.subject}</strong>
                  <span>{campaign.audienceLabel} · {campaign.categoryLabel} · {campaignStatusLabel(campaign)}</span>
                  <small>{campaign.createdAt ? new Date(campaign.createdAt).toLocaleString('en-GB') : 'Date unavailable'}</small>
                </div>
                <div className="admin-mail-campaign-stats">
                  <span><strong>{campaign.sentCount}</strong> sent</span>
                  <span className={campaign.failedCount ? 'failed' : ''}><strong>{campaign.failedCount}</strong> failed</span>
                  <span><strong>{campaign.recipientCount}</strong> total</span>
                </div>
                {campaign.failedCount > 0 && (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={retryingCampaignId === campaign.id}
                    onClick={() => void retryCampaign(campaign.id)}
                  >
                    <RefreshCw size={14} /> {retryingCampaignId === campaign.id ? 'Retrying…' : 'Retry failed only'}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
