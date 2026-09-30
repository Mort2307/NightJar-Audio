import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, FileText, Handshake, MessageCircle, Search, ShieldCheck, X } from 'lucide-react';
import { nightjarCollaboration, type CollaborationStatus } from '../platform/firebase-collaboration';
import { nightjarScripts } from '../platform/firebase-scripts';
import { demoCollaborations, demoDirectory, demoWriterScripts } from '../demo/nightjarDemo';
import { readDemo, writeDemo } from '../demo/demoSession';

type Props = {
  role: 'writer' | 'creator' | 'editor';
  notify: (message: string) => void;
  demoMode?: boolean;
  simulationMode?: boolean;
  onMessageUser?: (userId:string, collaborationId?:string) => void;
};

const statusLabel = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function CollaborationHub({ role, notify, demoMode = false, simulationMode = false, onMessageUser }: Props) {
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
  const [collaboratorQuery, setCollaboratorQuery] = useState('');
  const [collaboratorRole, setCollaboratorRole] = useState<'all' | 'creator' | 'editor'>('all');

  const load = async () => {
    setLoading(true);
    try {
      if (demoMode) {
        setProposals(readDemo('collaborations', demoCollaborations));
        setDirectory(structuredClone(demoDirectory).map((person:any) => ({
          ...person,
          roleAvailability: person.role === 'creator' ? 'Open to collaborations' : person.role === 'editor' ? 'Open for bookings' : person.role === 'writer' ? 'Open to commissions' : null,
          roleSpecialties: person.role === 'creator' ? ['Character roleplay','Narration'] : person.role === 'editor' ? ['Dialogue editing','Mixing'] : person.role === 'writer' ? ['Dialogue','Character development'] : [],
          favouriteTags: person.role === 'creator' ? ['Atmospheric','Story-led'] : person.role === 'editor' ? ['Sound-rich','Cinematic'] : ['Dialogue-heavy'],
          completedCollaborations: person.role === 'editor' ? 5 : person.role === 'creator' ? 4 : person.role === 'writer' ? 3 : 0,
          activityBadges: person.role === 'creator'
            ? [{id:'published-creator',label:'Published Creator',detail:'Has released work in the Nightjar catalogue.'},{id:'completed-collaborator',label:'Completed Collaborator',detail:'Has completed Nightjar collaborations.'}]
            : person.role === 'editor'
              ? [{id:'credited-editor',label:'Credited Audio Editor',detail:'Has public Nightjar release credits.'},{id:'frequent-collaborator',label:'Frequent Collaborator',detail:'Five or more completed Nightjar collaborations.'}]
              : [],
        })));
        if (role === 'writer') {
          const nextScripts = readDemo('writerScripts', demoWriterScripts);
          setScripts(nextScripts);
          setScriptId((value) => value || nextScripts[0]?.id || '');
        }
      } else {
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
      }
    } catch {
      notify('Collaboration workspace could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [role, demoMode]);
  useEffect(() => { if (simulationMode && !loading) writeDemo('collaborations', proposals); }, [proposals, loading, simulationMode]);

  const relevant = useMemo(() => proposals.filter((proposal) => role === 'writer'
    ? Boolean(proposal.writerUserId)
    : proposal.recipientRole === role), [proposals, role]);

  const eligibleCollaborators = useMemo(() => {
    const needle = collaboratorQuery.trim().toLowerCase();
    return directory
      .filter((person) => person.role === 'creator' || person.role === 'editor')
      .filter((person) => collaboratorRole === 'all' || person.role === collaboratorRole)
      .filter((person) => {
        if (!needle) return true;
        const searchable = [
          person.name,
          person.handle,
          person.headline,
          person.roleAvailability,
          ...(person.favouriteTags ?? []),
          ...(person.favouriteCategories ?? []),
          ...(person.roleFocus ?? []),
          ...(person.roleSpecialties ?? []),
          ...(person.roleSecondary ?? []),
        ].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(needle);
      })
      .sort((a, b) => (b.completedCollaborations ?? 0) - (a.completedCollaborations ?? 0) || String(a.name).localeCompare(String(b.name)));
  }, [directory, collaboratorQuery, collaboratorRole]);

  const send = async () => {
    if (!scriptId || !recipientUserId) return notify('Choose a script and collaborator first.');
    setSending(true);
    try {
      if (simulationMode) {
        const script = scripts.find((item) => item.id === scriptId);
        const person = directory.find((item) => item.userId === recipientUserId);
        setProposals((items) => [...items, {
          id: 'demo-collab-' + Date.now(), scriptId, scriptTitle: script?.title ?? 'Demo manuscript',
          writerUserId: 'demo-writer-mara', writerName: 'Mara Bell',
          recipientUserId, recipientName: person?.name ?? 'Demo collaborator', recipientRole: person?.role ?? 'creator',
          message, paymentProposal, licenceSummary, status: 'sent', responseNote: '',
        }]);
      } else {
        await nightjarCollaboration.send({ scriptId, recipientUserId, message, paymentProposal, licenceSummary });
        await load();
      }
      setMessage('');
      setPaymentProposal('');
      setLicenceSummary('');
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
      if (simulationMode) {
        setProposals((items) => items.map((item) => item.id === proposal.id ? { ...item, status, responseNote: note } : item));
      } else {
        await nightjarCollaboration.respond(proposal.id, status, note);
        await load();
      }
      notify('Collaboration response saved.');
    } catch {
      notify('Collaboration response could not be saved.');
    }
  };

  const setStatus = async (proposal: any, status: CollaborationStatus) => {
    try {
      if (simulationMode) {
        setProposals((items) => items.map((item) => item.id === proposal.id ? { ...item, status } : item));
      } else {
        await nightjarCollaboration.setStatus(proposal.id, status);
        await load();
      }
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

    {role === 'writer' && <div className="collaborator-directory">
      <div className="collaborator-directory-head">
        <div><span className="mini-label">COLLABORATOR DIRECTORY</span><h3>Find the right production partner.</h3><p>Search public Creator and Audio Editor profiles by name, specialty, tag or availability. Completed-collaboration counts come from finished Nightjar workflows.</p></div>
        <Handshake size={18}/>
      </div>
      <div className="role-directory-tools">
        <label className="creator-directory-search"><Search size={15}/><input value={collaboratorQuery} onChange={(event)=>setCollaboratorQuery(event.target.value)} placeholder="Search name, tag, specialty…"/></label>
        <select value={collaboratorRole} onChange={(event)=>setCollaboratorRole(event.target.value as 'all'|'creator'|'editor')}><option value="all">Creators & Audio Editors</option><option value="creator">Creators only</option><option value="editor">Audio Editors only</option></select>
      </div>
      <div className="collaborator-directory-grid">
        {eligibleCollaborators.slice(0,12).map((person)=><button type="button" className={recipientUserId === person.userId ? 'collaborator-directory-card selected' : 'collaborator-directory-card'} key={person.userId} onClick={()=>setRecipientUserId(person.userId)}>
          <span className="collaborator-directory-avatar">{person.avatarUrl ? <img className="avatar-approved-image" src={person.avatarUrl} alt="" /> : String(person.name ?? 'NJ').split(' ').map((part:string)=>part[0]).join('').slice(0,2)}</span>
          <span className="collaborator-directory-copy"><strong>{person.name}</strong><small>{person.role === 'editor' ? 'Audio Editor' : 'Creator'}{person.roleAvailability ? ' · ' + person.roleAvailability : ''}</small><em>{person.headline || [...(person.roleSpecialties??[]),...(person.favouriteTags??[])].slice(0,2).join(' · ') || 'Nightjar collaborator'}</em>{!!person.activityBadges?.length && <span className="collaborator-activity-badges">{person.activityBadges.slice(0,2).map((badge:any)=><span key={badge.id} title={badge.detail}><ShieldCheck size={10}/>{badge.label}</span>)}</span>}</span>
          <span className="collaborator-directory-reputation" title="Completed Nightjar collaborations"><Handshake size={12}/>{person.completedCollaborations ?? 0}</span>
        </button>)}
        {!eligibleCollaborators.length && <div className="people-empty"><Search size={17}/><strong>No collaborators match.</strong><span>Try another name, tag, specialty or role.</span></div>}
      </div>
    </div>}

    {role === 'writer' && <div className="collaboration-compose">
      <label>Manuscript<select value={scriptId} onChange={(event) => setScriptId(event.target.value)}><option value="">Choose a manuscript</option>{scripts.map((script) => <option key={script.id} value={script.id}>{script.title}</option>)}</select></label>
      <label>Selected collaborator<select value={recipientUserId} onChange={(event) => setRecipientUserId(event.target.value)}><option value="">Choose a Creator or Audio Editor</option>{directory.filter((person) => person.role === 'creator' || person.role === 'editor').map((person) => <option key={person.userId} value={person.userId}>{person.name} · {person.role === 'editor' ? 'Audio Editor' : 'Creator'} · {person.completedCollaborations ?? 0} completed</option>)}</select></label>
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
            <button className="secondary-button" onClick={() => {
              const targetUserId = role === 'writer' ? proposal.recipientUserId : proposal.writerUserId;
              if (!targetUserId) return;
              if (onMessageUser) onMessageUser(targetUserId, proposal.id);
              else window.dispatchEvent(new CustomEvent('nightjar:message-user', { detail: { userId: targetUserId, collaborationId: proposal.id } }));
            }}><MessageCircle size={13}/> Message collaborator</button>
            {onMessageUser && <button className="secondary-button" onClick={()=>onMessageUser(role === 'writer' ? proposal.recipientUserId : proposal.writerUserId)}><MessageCircle size={13}/> Message {role === 'writer' ? proposal.recipientName : proposal.writerName}</button>}
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
