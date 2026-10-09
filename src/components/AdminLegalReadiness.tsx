import { AlertTriangle, Check, FileKey2, ShieldCheck } from 'lucide-react';
import { NIGHTJAR_LEGAL_VERSION } from '../legal/nightjarLegal';

const rows = [
  { status:'built', title:'Versioned beta Terms, Privacy Notice and Professional Terms', detail:'Acceptance is recorded per account with exact document version and server timestamp.' },
  { status:'built', title:'Per-upload rights and contributor permissions', detail:'VA releases, Writer manuscripts, Audio Editor showcase audio and Artist portfolio work now require role-appropriate declarations.' },
  { status:'blocker', title:'Final legal operator identity and service address', detail:'Replace private-beta operator wording with the final legal entity/name and required contact details before commercial launch.' },
  { status:'advisory', title:'Targeted UK solicitor review (recommended)', detail:'Not a statutory prerequisite to operate, but professional advice is strongly recommended for adult-content classification, consumer/subscription contracts and contributor IP licences.' },
  { status:'blocker', title:'Privacy records and processor schedule', detail:'Finalise lawful bases, processors, retention periods, international transfers, data-subject request procedure and breach procedure.' },
  { status:'blocker', title:'Online Safety Act scope and children-access assessment', detail:'Document Nightjar’s service classification, risk assessment duties, content controls and highly effective age-assurance placement before public launch.' },
  { status:'blocker', title:'Production age assurance evidence', detail:'Replace temporary tester bypass with the production provider and retain the required effectiveness/privacy records.' },
  { status:'blocker', title:'Paid-service consumer flow', detail:'Before taking subscriptions, validate pricing disclosure, renewal/cancellation/refund wording and payment-provider terms for Nightjar’s content model.' },
] as const;

export default function AdminLegalReadiness() {
  const blockers=rows.filter((row)=>row.status==='blocker').length;
  return <section className="panel admin-legal-readiness">
    <div className="professional-role-head">
      <div><span className="mini-label">LEGAL / COMPLIANCE · LAUNCH GATE</span><h2>Beta terms are not the finish line.</h2><p>Nightjar can use the current documents for controlled testing, but commercial public launch stays blocked until the remaining legal/compliance work is signed off.</p></div>
      <FileKey2 size={20}/>
    </div>
    <div className="admin-legal-readiness-summary">
      <span className="status-pill">BETA LEGAL v{NIGHTJAR_LEGAL_VERSION}</span>
      <span className="status-pill warning">{blockers} LAUNCH BLOCKERS</span>
    </div>
    <div className="admin-legal-readiness-list">
      {rows.map((row)=><article key={row.title} className={row.status==='built'?'complete':row.status==='advisory'?'recommendation':'blocker'}>
        <span>{row.status==='built'?<Check size={15}/>:row.status==='advisory'?<ShieldCheck size={15}/>:<AlertTriangle size={15}/>}</span>
        <div><strong>{row.title}</strong><p>{row.detail}</p></div>
        <em>{row.status==='built'?'BUILT':row.status==='advisory'?'RECOMMENDED':'BEFORE LAUNCH'}</em>
      </article>)}
    </div>
    <div className="legal-beta-warning compact"><ShieldCheck size={15}/><div><strong>Do not remove these blockers just because the app functions.</strong><span>Practical legal compliance and technical enforcement are required. Independent solicitor advice is recommended, not automatically mandatory.</span></div></div>
  </section>;
}
