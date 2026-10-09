import { ArrowLeft, ArrowRight, FileText, ShieldCheck, Users } from 'lucide-react';
import { NIGHTJAR_LEGAL_DOCUMENTS, NIGHTJAR_LEGAL_VERSION } from '../legal/nightjarLegal';

/**
 * The public reading hub displays only the currently implemented/versioned
 * private-beta documents. Unapproved commercial drafts are not substituted
 * for terms that members have actually accepted.
 */
export default function LegalCentrePage() {
  const documents = [
    { id:'platform_terms' as const, icon:FileText, name:'Terms & Conditions', audience:'All Nightjar members' },
    { id:'privacy_notice' as const, icon:ShieldCheck, name:'Privacy Notice', audience:'All Nightjar members' },
    { id:'professional_terms' as const, icon:Users, name:'Professional & Contributor Terms', audience:'VA Creators · Writers · Audio Editors · Artists' },
  ];

  return <main className="legal-document-shell nj-legal-centre-shell">
    <article className="legal-document nj-legal-centre">
      <a className="legal-back" href="/account"><ArrowLeft size={15}/> Back to Nightjar</a>
      <div className="legal-document-head">
        <span className="mini-label">NIGHTJAR · YOUR AGREEMENTS</span>
        <h1>Terms & Conditions.</h1>
        <p>Read the documents that govern your Nightjar account. These are the current private-beta versions, not an activated paid-subscription contract.</p>
        <div><span>Private beta · version {NIGHTJAR_LEGAL_VERSION}</span><span>Adults 18+ only</span></div>
      </div>
      <nav className="nj-legal-centre-cards" aria-label="Nightjar legal documents">
        {documents.map(({id,icon:Icon,name,audience}) => {
          const doc = NIGHTJAR_LEGAL_DOCUMENTS[id];
          return <a key={id} className="nj-legal-centre-card" href={doc.path}>
            <span className="nj-legal-centre-icon"><Icon size={19} aria-hidden="true"/></span>
            <span><strong>{name}</strong><small>{audience}</small><em>{doc.summary}</em><small>Version {doc.version}</small></span>
            <ArrowRight size={17} aria-hidden="true"/>
          </a>;
        })}
      </nav>
      <div className="legal-beta-warning"><ShieldCheck size={18}/><div>
        <strong>Current beta agreements · commercial launch not yet active</strong>
        <span>Nightjar's expanded commercial contract drafts are still being finalised. They will receive their own version and fresh acceptance flow before any paid service starts. Age assurance, consumer checkout rights and operational compliance are separate requirements.</span>
      </div></div>
      <footer><strong>Nightjar — Audio, after dark.</strong><span>Always available from the app's T&Cs tab</span></footer>
    </article>
  </main>;
}
