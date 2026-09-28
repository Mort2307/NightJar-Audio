import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, FileText, Handshake, MessageCircle, X } from 'lucide-react';
import { nightjarCollaboration, type CollaborationStatus } from '../platform/firebase-collaboration';
import { nightjarScripts } from '../platform/firebase-scripts';

type Props = {
  role: 'writer' | 'creator' | 'editor';
  notify: (message: string) => void;
};

const statusLabel = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function CollaborationHub({ role, notify }: Props) {
  const [proposals, setProposals] = useState<any[]>([]);
  const [directory, setDirectory] = useState<any[]>([]);
  const [scripts, setScripts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scriptId, setScriptId] = useState('');
  const [recipientUserId, setRecipientUserId] = useState('');
  const [message, setMessage] = useState('');
  const [paymentProposal, setPaymentProposal] = useState('');
  const [licenceSummary, setLicenceSummary] = useState('');
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const tasks: Promise<any>[] = [nightjarCollaboration.list(), nightjarCollaboration.directory()];
      if (role === 'writer') tasks.push(nightjarScripts.writerScripts());
      const [collaborationData, directoryData, scriptData] = await Promise.all(tasks);
      setProposals(collaborationData.proposals ?? []);
      setDirectory(directoryData.people ?? []);
      if (role === 'writer') {
        const nextScripts = scriptData?.scripts ?? [];
        setScripts(nextScripts);
        setScriptId((value) => value || nextScripts[0]?.id || '');
      }
    } catch {
      notify('Collaboration workspace could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [role]);

  const relevant = useMemo(() => proposals.filter((proposal) => role === 'writer'
    ? Boolean(proposal.writerUserId)
    : proposal.recipientRole === role), [proposals, role]);

  const send = async () => {
    if (!scriptId || !recipientUserId) return notify('Choose a script and collaborator first.');
    setSending(true);
    try {
      await nightjarCollaboration.send({ scriptId, recipientUserId, message, paymentProposal, licenceSummary });
      setMessage('');
      setPaymentProposal('');
      setLicenceSummary('');
      await load();
      notify('Collaboration proposal sent. Its response state will stay visible here.');
    } catch {
      notify('Collaboration proposal could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const respond = async (proposal: any, status: CollaborationStatus) => {
    const note = ['interested', 'discussing', 'declined'].includes(status)
      ? window.prompt('Optional response note') ?? ''
      : '';
    try {
      await nightjarCollaboration.respond(proposal.id, status, note);
      await load();
      notify('Collaboration response saved.');
    } catch {
      notify('Collaboration response could not be saved.');
    }
  };

  const setStatus = async (proposal: any, status: CollaborationStatus) => {
    try {
      await nightjarCollaboration.setStatus(proposal.id, status);
      await load();
      notify('Collaboration status updated.');
    } catch {
      notify('Collaboration status could not be updated.');
    }
  };

  return <section className="research-panel collaboration-hub">
    <div className="research-panel-head">
      <div><span className="mini-label">COLLABORATION WORKSPACE</span><h2>Clear proposals. Clear answers.</h2><p>Keep creative business out of inbox limbo. Every proposal retains a visible response and production state.</p></div>
      <Handshake size={22}/>
    </div>

    {role === 'writer' && <div className="collaboration-compose">
      <label>Manuscript<select value={scriptId} onChange={(event) => setScriptId(event.target.value)}><option value="">Choose a manuscript</option>{scripts.map((script) => <option key={script.id} value={script.id}>{script.title}</option>)}</select></label>
      <label>Send to<select value={recipientUserId} onChange={(event) => setRecipientUserId(event.target.value)}><option value="">Choose a Creator or Audio Editor</option>{directory.filter((person) => person.role === 'creator' || person.role === 'editor').map((person) => <option key={person.userId} value={person.userId}>{person.name} · {person.role === 'editor' ? 'Audio Editor' : 'Creator'}</option>)}</select></label>
      <label className="research-span-two">Proposal message<textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Why you think this script and collaborator fit together."/></label>
      <label>Payment proposal<input value={paymentProposal} onChange={(event) => setPaymentProposal(event.target.value)} placeholder="e.g. £150 flat fee / discuss"/></label>
      <label>Licence summary<input value={licenceSummary} onChange={(event) => setLicenceSummary(event.target.value)} placeholder="e.g. 12-month non-exclusive licence"/></label>
      <button className="primary-button research-span-two" disabled={sending || !scriptId || !recipientUserId} onClick={() => void send()}>Send proposal <ArrowRight size={14}/></button>
    </div>}

    {loading ? <div className="people-empty">Loading collaboration state…</div> : relevant.length === 0 ? <div className="people-empty"><MessageCircle size={18}/><strong>No collaboration proposals yet.</strong><span>{role === 'writer' ? 'Send a manuscript directly when you are ready.' : 'Incoming collaboration proposals will appear here with an explicit response path.'}</span></div> : <div className="collaboration-list">
      {relevant.map((proposal) => {
        const incoming = role !== 'writer' && proposal.recipientUserId;
        return <article className="collaboration-card" key={proposal.id}>
          <div className="collaboration-card-top">
            <div><span>{statusLabel(proposal.status)}</span><h3>{proposal.scriptTitle}</h3><p>{incoming ? 'From ' + proposal.writerName : 'To ' + proposal.recipientName}</p></div>
            <FileText size={18}/>
          </div>
          {proposal.message && <p className="collaboration-message">{proposal.message}</p>}
          <dl className="collaboration-meta">
            <div><dt>Payment</dt><dd>{proposal.paymentProposal || 'Not specified'}</dd></div>
            <div><dt>Licence</dt><dd>{proposal.licenceSummary || 'Not specified'}</dd></div>
          </dl>
          {proposal.responseNote && <p className="collaboration-response"><strong>Response:</strong> {proposal.responseNote}</p>}
          <div className="collaboration-actions">
            {role !== 'writer' && !['declined','withdrawn','completed'].includes(proposal.status) && <>
              <button className="secondary-button" onClick={() => void respond(proposal, 'interested')}><Check size={13}/> Interested</button>
              <button className="secondary-button" onClick={() => void respond(proposal, 'discussing')}>Discuss</button>
              <button className="primary-button" onClick={() => void respond(proposal, 'accepted')}>Accept</button>
              <button className="ghost-button" onClick={() => void respond(proposal, 'declined')}><X size={13}/> Decline</button>
            </>}
            {['accepted','discussing','interested'].includes(proposal.status) && <button className="secondary-button" onClick={() => void setStatus(proposal, 'in_production')}>Mark in production</button>}
            {proposal.status === 'in_production' && <button className="primary-button" onClick={() => void setStatus(proposal, 'completed')}>Mark completed</button>}
            {role === 'writer' && !['withdrawn','declined','completed'].includes(proposal.status) && <button className="ghost-button" onClick={() => void setStatus(proposal, 'withdrawn')}>Withdraw</button>}
          </div>
        </article>;
      })}
    </div>}
  </section>;
}
