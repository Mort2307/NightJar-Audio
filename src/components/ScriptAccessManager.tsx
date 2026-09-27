import { useEffect, useMemo, useState } from 'react';
import { api } from '@appdeploy/client';
import { Download, Eye, KeyRound, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';

type AccessMode = 'read' | 'copy' | 'export';

type Props = {
  scriptId: string;
  notify: (message: string) => void;
};

const modeLabel = (grant: any) => grant.allowExport ? 'Full handoff' : grant.allowCopy ? 'Read + copy' : 'Protected read-only';

export default function ScriptAccessManager({ scriptId, notify }: Props) {
  const [grants, setGrants] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [recipientUserId, setRecipientUserId] = useState('');
  const [mode, setMode] = useState<AccessMode>('read');
  const [expiresAt, setExpiresAt] = useState('');
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);

  const activeGrants = useMemo(() => grants.filter((grant) => !grant.revokedAt), [grants]);

  const load = async () => {
    try {
      const { data } = await api.get('/api/scripts/' + encodeURIComponent(scriptId) + '/access');
      setGrants(data?.grants ?? []);
      setRequests(data?.pendingRequests ?? []);
      setRecipients(data?.eligibleRecipients ?? []);
      setActivity(data?.recentActivity ?? []);
    } catch {
      notify('Script access controls could not be loaded.');
    }
  };

  useEffect(() => { void load(); }, [scriptId]);

  const grant = async (targetUserId = recipientUserId, targetMode = mode) => {
    if (!targetUserId || busy) return;
    setBusy(true);
    try {
      await api.post('/api/scripts/' + encodeURIComponent(scriptId) + '/permissions', {
        recipientUserId: targetUserId,
        allowCopy: targetMode === 'copy' || targetMode === 'export',
        allowExport: targetMode === 'export',
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        purpose,
      });
      await load();
      setRecipientUserId('');
      setMode('read');
      setExpiresAt('');
      setPurpose('');
      notify(targetMode === 'export' ? 'Full script handoff granted. The recipient can explicitly export the manuscript.' : targetMode === 'copy' ? 'Protected read + copy access granted.' : 'Protected read-only access granted.');
    } catch {
      notify('Script access could not be granted.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (targetUserId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post('/api/scripts/' + encodeURIComponent(scriptId) + '/permissions', { recipientUserId: targetUserId, revoke: true });
      await load();
      notify('Script access revoked and active reader sessions closed.');
    } catch {
      notify('Script access could not be revoked.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="script-access-manager panel-card" aria-labelledby="script-access-title">
    <div className="section-head">
      <div><p className="eyebrow"><KeyRound size={14}/> SCRIPT ACCESS</p><h3 id="script-access-title">You decide who gets the manuscript.</h3></div>
      <button className="ghost-button with-icon" onClick={() => void load()}><RefreshCw size={13}/> Refresh</button>
    </div>
    <p className="panel-note">Default access is protected and non-exportable. Full handoff is an explicit writer choice for cases such as sending the complete script to a VA. Nightjar logs the handoff but does not stop a writer distributing their own work.</p>

    <div className="script-access-form">
      <label>Recipient<select value={recipientUserId} onChange={(event) => setRecipientUserId(event.target.value)}><option value="">Choose a Nightjar account…</option>{recipients.map((recipient) => <option key={recipient.userId} value={recipient.userId}>{recipient.name} · {recipient.role}{recipient.handle ? ' · @' + String(recipient.handle).replace(/^@/, '') : ''}</option>)}</select></label>
      <label>Access level<select value={mode} onChange={(event) => setMode(event.target.value as AccessMode)}><option value="read">Protected read-only</option><option value="copy">Protected read + copy</option><option value="export">Full handoff / export</option></select></label>
      <label>Expiry <span className="optional-label">optional</span><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
      <label className="script-access-purpose">Purpose <span className="optional-label">optional</span><input value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={160} placeholder="e.g. VA recording session"/></label>
      <button className="primary-button with-icon" disabled={!recipientUserId || busy} onClick={() => void grant()}>{mode === 'export' ? <Download size={14}/> : mode === 'copy' ? <KeyRound size={14}/> : <Eye size={14}/>} Grant access</button>
    </div>

    {mode === 'export' && <div className="writer-handoff-warning"><ShieldCheck size={16}/><div><strong>Full handoff is intentional.</strong><span>The recipient will be allowed to export the complete script. The export is watermarked, fingerprinted and logged, but once a writer deliberately exports their work to another person Nightjar cannot technically control what happens to that external copy.</span></div></div>}

    {!!requests.length && <div className="script-access-requests"><span className="mini-label">PENDING REQUESTS</span>{requests.map((request) => <div className="script-access-row" key={request.id}><div><strong>{request.requesterName}</strong><small>{request.requesterRole || 'Nightjar account'} requested access</small></div><div className="script-access-row-actions"><button disabled={busy} onClick={() => void grant(request.requesterUserId, 'read')}>Read only</button><button disabled={busy} onClick={() => void grant(request.requesterUserId, 'copy')}>Allow copy</button><button disabled={busy} onClick={() => void grant(request.requesterUserId, 'export')}>Full handoff</button></div></div>)}</div>}

    <div className="script-access-grants"><span className="mini-label">CURRENT ACCESS</span>{activeGrants.length ? activeGrants.map((grant) => <div className="script-access-row" key={grant.id ?? grant.recipientUserId}><div><strong>{grant.recipientName}</strong><small>{modeLabel(grant)}{grant.expiresAt ? ' · expires ' + new Date(grant.expiresAt).toLocaleString('en-GB') : ' · no expiry'}</small></div><button className="ghost-button with-icon" disabled={busy} onClick={() => void revoke(grant.recipientUserId)}><Trash2 size={13}/> Revoke</button></div>) : <div className="script-access-empty">Nobody else currently has access to this manuscript.</div>}</div>

    <div className="script-access-activity">
      <span className="mini-label">RECENT ACCESS ACTIVITY</span>
      {activity.length ? activity.slice(0, 16).map((item) => <div className="script-activity-row" key={item.id ?? String(item.sessionId) + String(item.createdAt)}>
        <div><strong>{item.actorName || 'Nightjar account'}</strong><small>{item.eventType === 'script_export' ? 'Exported the full script' : item.eventType === 'script_page_view' ? 'Viewed protected page' + (item.page != null ? ' ' + (Number(item.page) + 1) : '') : 'Opened a protected reader session'}</small></div>
        <time>{item.createdAt ? new Date(item.createdAt).toLocaleString('en-GB') : 'Recorded'}</time>
      </div>) : <div className="script-access-empty">No protected-reader activity has been recorded yet.</div>}
    </div>
  </section>;
}
