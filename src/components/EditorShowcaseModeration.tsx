import { useEffect, useState } from 'react';
import { Check, FileAudio, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { nightjarEditorPortfolio, type EditorPortfolioItem } from '../platform/firebase-editor-portfolio';

export default function EditorShowcaseModeration() {
  const [items, setItems] = useState<EditorPortfolioItem[]>([]);
  const [selected, setSelected] = useState<EditorPortfolioItem | null>(null);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await nightjarEditorPortfolio.moderationQueue();
      setItems(data.items ?? []);
      if (selected && !(data.items ?? []).some((item)=>item.id===selected.id)) setSelected(null);
    } catch {
      setMessage('Editor showcase moderation queue could not be loaded.');
    } finally { setLoading(false); }
  };

  useEffect(()=>{ void load(); },[]);

  useEffect(()=>{
    let cancelled=false;
    setBeforeUrl(null);setAfterUrl(null);
    if(!selected) return ()=>{cancelled=true;};
    if(selected.beforeAudioAvailable){
      void nightjarEditorPortfolio.playback(selected.id,'before').then((data)=>{if(!cancelled)setBeforeUrl(data.url);}).catch(()=>{});
    }
    if(selected.afterAudioAvailable){
      void nightjarEditorPortfolio.playback(selected.id,'after').then((data)=>{if(!cancelled)setAfterUrl(data.url);}).catch(()=>{});
    }
    return ()=>{cancelled=true;};
  },[selected?.id]);

  const decide=async(decision:'approved'|'changes'|'rejected')=>{
    if(!selected)return;
    const note=decision==='approved'?'':window.prompt(decision==='changes'?'What should the Editor change?':'Moderator note (optional)')??'';
    try{
      await nightjarEditorPortfolio.moderate(selected.id,decision,note);
      setMessage(decision==='approved'?'Editor showcase approved and published.':decision==='changes'?'Changes requested.':'Editor showcase rejected.');
      setSelected(null);setBeforeUrl(null);setAfterUrl(null);
      await load();
    }catch{setMessage('Editor showcase moderation decision could not be saved.');}
  };

  return <section className="panel editor-showcase-moderation">
    <div className="professional-role-head">
      <div><span className="mini-label">ADMIN · EDITOR SHOWCASE MODERATION</span><h2>Approve portfolio audio before it goes public.</h2><p>Check rights attestations, description and the actual audio. Before/after samples should not expose client or performer material without permission.</p></div>
      <ShieldCheck size={19}/>
    </div>
    <div className="editor-showcase-moderation-layout">
      <aside>
        <button className="ghost-button" disabled={loading} onClick={()=>void load()}><RefreshCw size={13}/> Refresh</button>
        {items.map((item)=><button key={item.id} className={selected?.id===item.id?'moderation-item active':'moderation-item'} onClick={()=>setSelected(item)}><FileAudio size={15}/><span><strong>{item.title}</strong><small>{item.beforeAudioAvailable?'Before + after':'Finished sample'}</small></span></button>)}
        {!items.length&&!loading&&<div className="people-empty"><Check size={16}/><strong>Queue clear.</strong><span>No Editor showcase samples are awaiting review.</span></div>}
      </aside>
      <article>
        {selected?<><div className="moderation-preview-head"><div><span className="mini-label">EDITOR SHOWCASE</span><h3>{selected.title}</h3><p>{selected.description}</p></div></div>
          <div className="creator-profile-tags">{[...(selected.services??[]),...(selected.techniques??[])].map((x)=><span key={x}>{x}</span>)}</div>
          <div className="editor-showcase-preview-audio">
            {selected.beforeAudioAvailable&&<label><strong>Before</strong>{beforeUrl?<audio controls src={beforeUrl}/>:<span>Opening protected preview…</span>}</label>}
            <label><strong>Finished / after</strong>{afterUrl?<audio controls src={afterUrl}/>:<span>Opening protected preview…</span>}</label>
          </div>
          <div className="rights-ai-lock"><ShieldCheck size={15}/><div><strong>Uploader attestations recorded</strong><span>Rights: {selected.rightsConfirmed?'confirmed':'missing'} · contributor/client permission: {selected.contributorPermissionsConfirmed?'confirmed':'missing'}{selected.clientPermissionNote?' · note recorded':''}</span></div></div>
          <div className="moderation-actions"><button className="secondary-button" onClick={()=>void decide('changes')}>Request changes</button><button className="ghost-button" onClick={()=>void decide('rejected')}><X size={13}/> Reject</button><button className="primary-button" onClick={()=>void decide('approved')}><Check size={13}/> Approve & publish</button></div>
        </>:<div className="people-empty"><FileAudio size={17}/><strong>Select a showcase item.</strong><span>Protected preview audio appears here.</span></div>}
      </article>
    </div>
    {message&&<p className="panel-note" role="status">{message}</p>}
  </section>;
}
