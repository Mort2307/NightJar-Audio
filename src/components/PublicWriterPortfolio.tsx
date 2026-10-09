import { FileText, Handshake, ShieldCheck } from 'lucide-react';

type WriterPortfolioItem = {
  id:string;
  title:string;
  synopsis:string;
  genres:string[];
  tropes:string[];
  visibility:string;
  collaborationWanted:boolean;
  editorWanted:boolean;
  licenceType:string;
  commercialUse:boolean;
  status:string;
  updatedAt:string|null;
};

export default function PublicWriterPortfolio({ items }: { items: WriterPortfolioItem[] }) {
  if(!items?.length)return null;
  return <section className="public-writer-portfolio">
    <div className="public-role-profile-head">
      <div><span className="mini-label">APPROVED WRITING PORTFOLIO</span><h3>Published script work</h3><p>Public metadata only. Protected manuscript text and source files remain private.</p></div>
      <FileText size={18}/>
    </div>
    <div className="public-writer-portfolio-grid">
      {items.map((item)=><article key={item.id}>
        <div className="public-writer-card-head">
          <div><span className="mini-label">{item.status.toUpperCase()}</span><strong>{item.title}</strong></div>
          <span className="status-pill">{item.visibility==='licensed'?'LICENSED':'AVAILABLE'}</span>
        </div>
        <p>{item.synopsis}</p>
        {!![...(item.genres??[]),...(item.tropes??[])].length&&<div className="creator-profile-tags">{[...(item.genres??[]),...(item.tropes??[])].slice(0,10).map((tag)=><span key={tag}>{tag}</span>)}</div>}
        <div className="public-writer-card-meta">
          <span><ShieldCheck size={11}/>{item.licenceType==='exclusive'?'Exclusive licence':item.licenceType==='non-exclusive'?'Non-exclusive licence':'Rights not currently licensed'}</span>
          {item.collaborationWanted&&<span><Handshake size={11}/>Open to collaboration</span>}
          {item.editorWanted&&<span>Editor wanted</span>}
        </div>
      </article>)}
    </div>
  </section>;
}
