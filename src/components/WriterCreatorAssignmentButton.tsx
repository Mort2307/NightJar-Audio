import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Handshake, LoaderCircle, Search, X } from 'lucide-react';
import { nightjarCollaboration } from '../platform/firebase-collaboration';
import { pendingPrivateCreateId, clearPrivateCreateId } from '../platform/client-create-idempotency';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';

type Props = {
  script: { id: string; title?: string | null; version?: number; status?: string | null };
  notify: (message: string) => void;
  simulationMode?: boolean;
};

type Collaborator = {
  userId: string;
  name: string;
  role?: string;
  roles?: string[];
  headline?: string | null;
  roleAvailability?: string | null;
  roleSpecialties?: string[];
};

export default function WriterCreatorAssignmentButton({ script, notify, simulationMode = false }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [people, setPeople] = useState<Collaborator[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  const [paymentProposal, setPaymentProposal] = useState('');
  const [licenceSummary, setLicenceSummary] = useState('');
  const [workType, setWorkType] = useState<'' | 'voluntary' | 'private_commission' | 'nightjar_original'>('');
  const [review, setReview] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeComposer = useCallback(() => { if (!sending) setOpen(false); }, [sending]);
  useDialogFocusTrap(dialogRef, { active: open, onEscape: closeComposer });

  const openComposer = async () => {
    setOpen(true);
    setReview(false);
    if (people.length || simulationMode) return;
    setLoading(true);
    try {
      const result = await nightjarCollaboration.directory();
      const approved = (result.people ?? []).filter((person: Collaborator) =>
        person.role === 'creator' || (Array.isArray(person.roles) && person.roles.includes('creator'))
      );
      setPeople(approved);
    } catch {
      notify('The approved Creator directory could not be loaded. Your manuscript has not been assigned.');
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const eligible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return people.filter((person) => !term || [person.name, person.headline, person.roleAvailability, ...(person.roleSpecialties ?? [])]
      .filter(Boolean).join(' ').toLocaleLowerCase().includes(term));
  }, [people, query]);

  const selected = people.find((person) => person.userId === selectedId);

const assignmentFingerprint = async (scriptId: string, recipientId: string) => {
  const bytes = new TextEncoder().encode(scriptId + ':' + recipientId);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
};

  useEffect(() => {
    if (!open) {
      setReview(false);
      setQuery('');
      setSelectedId('');
      setMessage('');
      setPaymentProposal('');
      setLicenceSummary('');
      setWorkType('');
    }
  }, [open]);

  const send = async () => {
    if (!selected || !workType || sending) return;
    setSending(true);
    try {
      if (simulationMode) {
        notify('Simulation only: assignment was not sent to a real Creator.');
      } else {
        const fingerprint = await assignmentFingerprint(script.id, selected.userId);
        const requestId = pendingPrivateCreateId('writer-creator-assignment', fingerprint);
        await nightjarCollaboration.send({
          scriptId: script.id,
          recipientUserId: selected.userId,
          message,
          paymentProposal,
          licenceSummary,
          assignmentType: 'private_writer_assignment',
          workType,
          scriptVersion: Number(script.version ?? 1),
          clientRequestId: requestId,
        });
        clearPrivateCreateId('writer-creator-assignment', requestId, fingerprint);
        notify('Private assignment sent. Only the selected Creator has been notified.');
      }
      setOpen(false);
    } catch {
      notify('Assignment could not be sent. Your manuscript remains private; check Collaborations before retrying.');
    } finally {
      setSending(false);
    }
  };

  return <>
    <button type="button" className="nj-writer-assign-trigger" onClick={() => void openComposer()}
      aria-label={'Assign ' + (script.title || 'manuscript') + ' to a Creator'}>
      <Handshake size={15} aria-hidden="true"/> Assign to Creator
    </button>
    {open && <div className="nj-writer-assignment-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !sending) setOpen(false);
    }}>
      <section ref={dialogRef} className="nj-writer-assignment-dialog" role="dialog" aria-modal="true" tabIndex={-1}
        aria-labelledby={'nj-assignment-title-' + script.id}>
        <header className="nj-writer-assignment-head">
          <div><span className="mini-label">PRIVATE PRODUCTION ASSIGNMENT</span>
            <h2 id={'nj-assignment-title-' + script.id}>Assign this script</h2>
            <p>{script.title || 'Untitled manuscript'} · Version {Number(script.version ?? 1)}</p>
          </div>
          <button type="button" className="ghost-button" aria-label="Close assignment" disabled={sending} onClick={() => setOpen(false)}><X size={18}/></button>
        </header>
        {loading ? <p className="nj-assignment-state"><LoaderCircle size={17}/> Loading approved Creators…</p> : <>
          {!review ? <>
            <label className="nj-assignment-field">Choose one approved VA/Creator
              <span className="nj-assignment-search"><Search size={15}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search Creator name or specialty" /></span>
            </label>
            <div className="nj-assignment-people" role="listbox" aria-label="Approved Creators">
              {eligible.map((person) => <button type="button" role="option" aria-selected={selectedId === person.userId}
                className={selectedId === person.userId ? 'nj-assignment-person selected' : 'nj-assignment-person'}
                key={person.userId} onClick={() => setSelectedId(person.userId)}>
                <span><strong>{person.name}</strong><small>{person.headline || person.roleAvailability || 'Approved NightJar Creator'}</small></span>
                {selectedId === person.userId && <Check size={17}/>}
              </button>)}
              {!eligible.length && <p className="nj-assignment-state">No approved Creators match that search.</p>}
            </div>
            <label className="nj-assignment-field">Work arrangement
              <select value={workType} required onChange={(event)=>setWorkType(event.target.value as typeof workType)}>
                <option value="" disabled>Choose the work arrangement…</option>
                <option value="voluntary">Voluntary submission · Writer retains copyright</option>
                <option value="private_commission">Private commission · agree ownership and fee separately</option>
                <option value="nightjar_original">NightJar Original · separate commission agreement</option>
              </select>
            </label>
            <label className="nj-assignment-field">Private note <textarea value={message} onChange={(event)=>setMessage(event.target.value)} rows={3} maxLength={2400} placeholder="Tell the selected Creator what you have in mind…"/></label>
            <label className="nj-assignment-field">Proposed Writer payment <input value={paymentProposal} onChange={(event)=>setPaymentProposal(event.target.value)} maxLength={800} placeholder="Optional · e.g. £150 Writer commission, or to be discussed"/></label>
            <label className="nj-assignment-field">Rights / licence summary <input value={licenceSummary} onChange={(event)=>setLicenceSummary(event.target.value)} maxLength={1200} placeholder="Optional · record the proposed rights arrangement"/></label>
            <p className="nj-assignment-privacy">This is a private invitation, not a public listing. The Writer and selected VA/Creator are linked for future release credits. No ownership transfer or payment is triggered by sending it.</p>
            <footer className="nj-assignment-actions">
              <button type="button" className="ghost-button" onClick={()=>setOpen(false)}>Cancel</button>
              <button type="button" className="primary-button" disabled={!selected || loading || !workType} onClick={()=>setReview(true)}>Review assignment <ArrowRight size={15}/></button>
            </footer>
          </> : <>
            <div className="nj-assignment-review">
              <p><span>Script</span><strong>{script.title || 'Untitled manuscript'} · v{Number(script.version ?? 1)}</strong></p>
              <p><span>Assigned to</span><strong>{selected?.name}</strong></p>
              <p><span>Arrangement</span><strong>{workType === 'voluntary' ? 'Voluntary submission' : workType === 'private_commission' ? 'Private commission' : 'NightJar Original'}</strong></p>
              <p><span>Writer payment proposal</span><strong>{paymentProposal.trim() || 'Not specified'}</strong></p>
              <p><span>Rights summary</span><strong>{licenceSummary.trim() || 'Not specified'}</strong></p>
              <p><span>Credits linked</span><strong>Writer · {selected?.name} (VA/Creator)</strong></p>
            </div>
            <p className="nj-assignment-privacy">Only {selected?.name} receives this assignment. They can accept or decline it in their private Collaborations workspace. The script is not published or listed.</p>
            <footer className="nj-assignment-actions">
              <button type="button" className="ghost-button" onClick={()=>setReview(false)} disabled={sending}>Back</button>
              <button type="button" className="primary-button" onClick={()=>void send()} disabled={sending}>
                {sending ? <><LoaderCircle size={15}/> Sending…</> : <>Send private assignment <ArrowRight size={15}/></>}
              </button>
            </footer>
          </>}
        </>}
      </section>
    </div>}
  </>;
}
