import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Link2, Mail, RefreshCw, Send, ShieldCheck, Unplug, Users } from 'lucide-react';
import { applyNightjarUpdate, checkNightjarUpdate, type NightjarUpdateStatus } from '../platform/pwa';
import {
  nightjarAdministration,
  type AdminEmailAudience,
  type AdminEmailAudiencePreview,
  type AdminEmailCampaign,
  type AdminEmailCategory,
  type AdminGmailOAuthStatus,
} from '../platform/firebase-administration';

const AUDIENCES: { value: AdminEmailAudience; label: string; detail: string }[] = [
  { value: 'selected_members', label:'Selected individual members', detail:'Choose actual Nightjar accounts and send each person their own private email.' },
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
  const [memberSearch, setMemberSearch] = useState('');
  const [memberAccounts, setMemberAccounts] = useState<Array<{userId:string;name:string;email:string;status:string;role?:string;roles?:string[]}>>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [loadingMembers,setLoadingMembers] = useState(false);
  const [manualTestStatus, setManualTestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [manualTestMessage, setManualTestMessage] = useState('');
  const [manualTestResults, setManualTestResults] = useState<{ email: string; status: 'sent' | 'failed'; error?: string }[]>([]);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [retryingCampaignId, setRetryingCampaignId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [buildStatus, setBuildStatus] = useState<NightjarUpdateStatus | null>(null);
  const [checkingBuild, setCheckingBuild] = useState(false);
  const [refreshingBuild, setRefreshingBuild] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<AdminGmailOAuthStatus | null>(null);
  const [gmailStatusLoading, setGmailStatusLoading] = useState(false);
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [gmailDisconnecting, setGmailDisconnecting] = useState(false);

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

  const refreshPreview = async (nextAudience = audience, ids = selectedMemberIds) => {
    setLoadingPreview(true);
    try {
      setPreview(await nightjarAdministration.emailAudiencePreview(nextAudience, ids));
    } catch (error) {
      setPreview(null);
      setNotice({ kind: 'error', text: cleanError(error) });
    } finally {
      setLoadingPreview(false);
    }
  };

  const refreshGmailStatus = async () => {
    setGmailStatusLoading(true);
    try {
      const status = await nightjarAdministration.gmailOAuthStatus();
      setGmailStatus(status);
      return status;
    } catch (error) {
      setNotice({ kind: 'error', text: cleanError(error) });
      return null;
    } finally {
      setGmailStatusLoading(false);
    }
  };

  const connectGmail = async () => {
    setGmailConnecting(true);
    setNotice(null);
    try {
      const setup = await nightjarAdministration.beginGmailOAuth();
      const popup = window.open(
        setup.authorizationUrl,
        'nightjar-gmail-oauth',
        'popup=yes,width=620,height=760,resizable=yes,scrollbars=yes',
      );
      if (!popup) {
        throw new Error('Your browser blocked the Google authorisation window. Allow pop-ups for Nightjar and try again.');
      }

      const startedAt = Date.now();
      const timer = window.setInterval(() => {
        void (async () => {
          const status = await refreshGmailStatus();
          if (status?.healthy) {
            window.clearInterval(timer);
            try { popup.close(); } catch { /* popup close is best effort */ }
            setGmailConnecting(false);
            setNotice({
              kind: 'success',
              text: 'Nightjar Mail is connected to ' + status.senderEmail + ' through Gmail API OAuth 2.0.',
            });
            return;
          }
          if (popup.closed || Date.now() - startedAt > 120000) {
            window.clearInterval(timer);
            setGmailConnecting(false);
          }
        })();
      }, 1800);
    } catch (error) {
      setGmailConnecting(false);
      setNotice({ kind: 'error', text: cleanError(error) });
    }
  };

  const disconnectGmail = async () => {
    setGmailDisconnecting(true);
    setNotice(null);
    try {
      await nightjarAdministration.disconnectGmailOAuth();
      await refreshGmailStatus();
      setNotice({ kind: 'success', text: 'Nightjar Mail has been disconnected from Gmail.' });
    } catch (error) {
      setNotice({ kind: 'error', text: cleanError(error) });
    } finally {
      setGmailDisconnecting(false);
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
    if (audience !== 'selected_members') void refreshPreview(audience);
    else {
      setPreview(null);
      setLoadingMembers(true);
      void nightjarAdministration.overview().then(data=>{
        setMemberAccounts((data.people?.accounts??[]).filter((person:any)=>person.userId && person.email && person.status==='active' && person.role!=='admin'));
      }).catch(error=>setNotice({kind:'error',text:cleanError(error)}))
        .finally(()=>setLoadingMembers(false));
    }
    setConfirmed(false);
  }, [audience]);

  useEffect(() => {
    void refreshCampaigns();
    void refreshGmailStatus();
    void checkNightjarUpdate().then(setBuildStatus).catch(() => { /* mail remains usable if version check fails */ });
  }, []);

  const sendTest = async (recipientEmails: string[] = []) => {
    if (!gmailStatus?.healthy) {
      const message = 'Connect Nightjar Mail to Gmail before sending a test.';
      setNotice({ kind: 'error', text: message });
      if (recipientEmails.length) {
        setManualTestStatus('error');
        setManualTestMessage(message);
      }
      return;
    }
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
    if (!subject.trim() || !body.trim() || !confirmed || !preview?.recipientCount || preview.overSendLimit
        || (audience==='selected_members' && preview.recipientCount!==selectedMemberIds.length)) return;
    setSendingCampaign(true);
    setNotice(null);
    try {
      const result = await nightjarAdministration.sendEmailCampaign({
        subject: subject.trim(),
        body: body.trim(),
        audience,
        category,
        ...(audience==='selected_members' ? {selectedUserIds:selectedMemberIds} : {}),
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

  const sendDisabled = !gmailStatus?.healthy
    || !subject.trim()
    || !body.trim()
    || !confirmed
    || !preview?.recipientCount
    || preview.overSendLimit
    || (audience==='selected_members' && preview.recipientCount!==selectedMemberIds.length)
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
          <div><strong>Nightjar → one user</strong><span>One Gmail API message and one To address per person</span></div>
        </div>
      </div>

      <div className={gmailStatus?.healthy ? 'admin-mail-gmail-status connected' : gmailStatus?.reconnectRequired ? 'admin-mail-gmail-status warning' : 'admin-mail-gmail-status'}>
        <div className="admin-mail-gmail-identity">
          <span className="admin-mail-gmail-icon"><Link2 size={18} /></span>
          <div>
            <span className="mini-label">MAIL TRANSPORT · GMAIL API / OAUTH 2.0</span>
            <strong>{gmailStatus?.senderEmail ?? 'nightjar.audio.app@gmail.com'}</strong>
            <small>
              {!gmailStatus?.configured
                ? 'OAuth client credentials still need configuring in Firebase.'
                : gmailStatusLoading
                  ? 'Checking Gmail authorisation…'
                  : gmailStatus?.healthy
                    ? 'Connected · send-only Gmail permission · no inbox reading'
                    : gmailStatus?.reconnectRequired
                      ? 'Google authorisation needs reconnecting.'
                      : 'Not connected yet. Authorise the Nightjar Gmail account once.'}
            </small>
          </div>
        </div>
        <div className="admin-mail-gmail-actions">
          <span className={gmailStatus?.healthy ? 'status-pill' : 'status-pill muted'}>
            {gmailStatus?.healthy ? 'CONNECTED' : gmailStatus?.reconnectRequired ? 'RECONNECT' : gmailStatus?.configured ? 'NOT CONNECTED' : 'SETUP REQUIRED'}
          </span>
          <button
            className={gmailStatus?.healthy ? 'secondary-button' : 'primary-button'}
            type="button"
            disabled={gmailConnecting || gmailStatusLoading || !gmailStatus?.configured}
            onClick={() => void connectGmail()}
          >
            <ExternalLink size={14} /> {gmailConnecting ? 'Waiting for Google…' : gmailStatus?.healthy ? 'Re-authorise Gmail' : 'Connect Gmail'}
          </button>
          {gmailStatus?.connected && (
            <button
              className="ghost-button"
              type="button"
              disabled={gmailDisconnecting}
              onClick={() => void disconnectGmail()}
            >
              <Unplug size={14} /> {gmailDisconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          )}
          <button
            className="ghost-button"
            type="button"
            disabled={gmailStatusLoading}
            onClick={() => void refreshGmailStatus()}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className={buildStatus?.updateAvailable ? 'admin-mail-build-check outdated' : 'admin-mail-build-check'}>
        <div>
          <span className="mini-label">MAIL UI BUILD</span>
          <strong>Running {buildStatus?.currentBuildId ?? __NIGHTJAR_BUILD_ID__}</strong>
          <small>
            {buildStatus?.latestBuildId
              ? `Latest deployed ${buildStatus.latestBuildId}${buildStatus.updateAvailable ? ' · update required' : ' · current'}`
              : 'Latest deployed build not checked yet'}
          </small>
        </div>
        <div className="admin-mail-build-actions">
          <button
            className="ghost-button"
            type="button"
            disabled={checkingBuild || refreshingBuild}
            onClick={() => {
              setCheckingBuild(true);
              void checkNightjarUpdate()
                .then(setBuildStatus)
                .finally(() => setCheckingBuild(false));
            }}
          >
            <RefreshCw size={14} /> {checkingBuild ? 'Checking…' : 'Check build'}
          </button>
          <button
            className={buildStatus?.updateAvailable ? 'primary-button' : 'secondary-button'}
            type="button"
            disabled={refreshingBuild}
            onClick={() => {
              setRefreshingBuild(true);
              void applyNightjarUpdate();
            }}
          >
            <RefreshCw size={14} /> {refreshingBuild ? 'Refreshing…' : buildStatus?.updateAvailable ? 'Load latest Nightjar' : 'Force refresh Nightjar Mail'}
          </button>
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

          {audience==='selected_members' && <section className="nj-mail-member-picker" aria-label="Select individual Nightjar email recipients">
            <div className="nj-mail-member-picker-head"><div><strong>Select members</strong><small>Choose up to 25 active member accounts. This is LIVE delivery, not a test.</small></div><span className="status-pill">{selectedMemberIds.length}/25</span></div>
            <input type="search" value={memberSearch} onChange={e=>setMemberSearch(e.target.value)}
              placeholder="Search by name, email or professional role" aria-label="Search individual Nightjar members"/>
            <div className="nj-mail-member-list">
              {memberAccounts.filter(person=>[person.name,person.email,person.role,...(person.roles??[])].join(' ').toLowerCase().includes(memberSearch.toLowerCase())).slice(0,100).map(person=><label key={person.userId} className={selectedMemberIds.includes(person.userId)?'nj-mail-member-row selected':'nj-mail-member-row'}>
                <input type="checkbox" checked={selectedMemberIds.includes(person.userId)} disabled={sendingCampaign || (!selectedMemberIds.includes(person.userId) && selectedMemberIds.length>=25)}
                  onChange={event=>{
                    setSelectedMemberIds(current=>event.target.checked?[...current,person.userId]:current.filter(id=>id!==person.userId));
                    setPreview(null);
                    setConfirmed(false);
                  }}/>
                <span><strong>{person.name}</strong><small>{person.email}</small></span>
                <span>{(person.roles??[person.role]).filter(Boolean).join(' · ')}</span>
              </label>)}
              {loadingMembers&&<p>Checking real Nightjar accounts…</p>}
              {!loadingMembers&&!memberAccounts.length&&<p>No active, addressable member accounts were returned. Refresh Nightjar Mail to retry.</p>}
            </div>
            <div className="nj-mail-member-review">
              <button type="button" className="secondary-button" disabled={!selectedMemberIds.length || loadingPreview || sendingCampaign}
                onClick={()=>{setConfirmed(false);void refreshPreview('selected_members',selectedMemberIds);}}>
                <ShieldCheck size={14}/>{loadingPreview?'Reviewing…':'Review exact recipients'}
              </button>
              {!!selectedMemberIds.length&&<button type="button" className="ghost-button" onClick={()=>{setSelectedMemberIds([]);setPreview(null);setConfirmed(false);}}>Clear selection</button>}
            </div>
            {!preview&&!!selectedMemberIds.length&&<small>Recipient list changed. Review the exact selected members before enabling Send.</small>}
          </section>}

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
                disabled={!gmailStatus?.healthy || !subject.trim() || !body.trim() || sendingTest || sendingCampaign}
              >
                <Mail size={15} /> {sendingTest ? 'Sending test…' : 'Send test to me'}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void sendTest(parsedManualTestEmails)}
                disabled={
                  !gmailStatus?.healthy
                  || !subject.trim()
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
            <small className="admin-mail-test-safety">Each address gets its own Gmail API message with exactly one To recipient. Manual test addresses are never added to your Nightjar member or tester audience.</small>
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
              <span>This audience exceeds the current {preview.sendLimit}-message Gmail API safety limit. Nothing will send until the audience is reduced or the delivery layer is scaled.</span>
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
