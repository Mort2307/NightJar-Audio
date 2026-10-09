import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { legalDocumentForPath } from '../legal/nightjarLegal';

export default function LegalDocumentPage() {
  const document = legalDocumentForPath(window.location.pathname);

  if (!document) {
    return <main className="legal-document-shell"><article className="legal-document"><h1>Legal document not found</h1><a href="/account">Return to Nightjar</a></article></main>;
  }

  return <main className="legal-document-shell">
    <article className="legal-document">
      <a className="legal-back" href="/legal"><ArrowLeft size={14}/> Back to Nightjar</a>
      <div className="legal-document-head">
        <span className="mini-label">NIGHTJAR · PRIVATE BETA LEGAL</span>
        <h1>{document.title}</h1>
        <p>{document.summary}</p>
        <div><span>Version {document.version}</span><span>Effective for private beta · 9 October 2026</span></div>
      </div>
      <div className="legal-beta-warning"><ShieldCheck size={17}/><div><strong>Beta document</strong><span>This is the operational private-beta version. Before commercial launch Nightjar must finalise operator details, legally applicable consumer terms, safeguards and privacy records. Targeted solicitor advice is recommended but is not a statutory condition of launch.</span></div></div>
      <div className="legal-document-sections">
        {document.sections.map((section)=><section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph)=><p key={paragraph}>{paragraph}</p>)}
          {!!section.bullets?.length&&<ul>{section.bullets.map((bullet)=><li key={bullet}>{bullet}</li>)}</ul>}
        </section>)}
      </div>
      <footer><strong>Nightjar — Audio, after dark.</strong><span>Private beta legal framework · version {document.version}</span></footer>
    </article>
  </main>;
}
