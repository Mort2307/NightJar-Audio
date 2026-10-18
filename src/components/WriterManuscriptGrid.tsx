import { useMemo, useState } from 'react';
import { ArrowRight, FileText, Search } from 'lucide-react';
import './writer-manuscript-grid.css';

export type WriterManuscriptSummary = {
  id: string;
  title?: string | null;
  status?: string | null;
  version?: number;
  updatedAt?: string | null;
  sourceFile?: {fileName?: string | null} | null;
};

const displayStatus = (raw: unknown) => {
  switch (String(raw ?? 'Draft')) {
    case 'Submitted': return {label:'Awaiting review', tone:'pending'};
    case 'Under review': return {label:'Under review', tone:'pending'};
    case 'Approved': return {label:'Approved', tone:'approved'};
    case 'Published': return {label:'Published', tone:'approved'};
    case 'Revision requested': return {label:'Changes requested', tone:'revision'};
    case 'Rejected': return {label:'Rejected', tone:'revision'};
    default: return {label:'Draft', tone:'draft'};
  }
};

export default function WriterManuscriptGrid({
  scripts, onOpen,
}: {
  scripts: WriterManuscriptSummary[];
  onOpen: (script: WriterManuscriptSummary) => void;
}) {
  const [filter,setFilter] = useState('');
  const shown = useMemo(() => scripts.filter(script => {
    const search = filter.trim().toLowerCase();
    return !search || String(script.title ?? '').toLowerCase().includes(search)
      || displayStatus(script.status).label.toLowerCase().includes(search);
  }), [scripts, filter]);

  return <section className="nj-writer-library-page" id="writer-manuscript-library" aria-label="Your saved manuscripts">
    <div className="nj-writer-library-heading">
      <div>
        <span className="mini-label">YOUR PRIVATE LIBRARY</span>
        <h2>My manuscripts</h2>
        <p>Choose a title to see its full details, edit your draft, manage rights or view NightJar's review decision.</p>
      </div>
      <span className="nj-writer-manuscript-count">{scripts.length} manuscript{scripts.length===1?'':'s'}</span>
    </div>
    {scripts.length > 4 && <label className="nj-writer-library-search">
      <Search size={17} aria-hidden="true"/>
      <span className="sr-only">Find a manuscript by title or status</span>
      <input type="search" value={filter} onChange={e=>setFilter(e.target.value)}
        placeholder="Find a manuscript or status…" aria-label="Search my manuscripts"/>
    </label>}
    {shown.length ? <div className="nj-writer-manuscript-grid">
      {shown.map(script=>{
        const status=displayStatus(script.status);
        const title=String(script.title ?? '').trim() || 'Untitled manuscript';
        return <button type="button" key={script.id}
          className="nj-writer-manuscript-card"
          onClick={()=>onOpen(script)}
          aria-label={`Open ${title}. Status: ${status.label}`}>
          <span className="nj-writer-manuscript-card-top">
            <FileText size={21} aria-hidden="true"/>
            <span className={'nj-writer-manuscript-status is-'+status.tone}>{status.label}</span>
          </span>
          <strong>{title}</strong>
          <span className="nj-writer-manuscript-card-bottom">
            <small>Version {Number(script.version ?? 1)}{script.sourceFile?.fileName ? ' · Uploaded manuscript' : ' · Written in NightJar'}</small>
            <span className="nj-writer-open-label">Open details <ArrowRight size={16} aria-hidden="true"/></span>
          </span>
        </button>;
      })}
    </div> : <div className="nj-writer-library-empty" role="status">
      <strong>{scripts.length ? 'No manuscripts match your search.' : 'No manuscripts yet.'}</strong>
      <p>{scripts.length ? 'Try a different title or status.' : 'Use Start or upload a manuscript above to create your first private draft.'}</p>
    </div>}
  </section>;
}
