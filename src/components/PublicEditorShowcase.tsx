import { useState } from 'react';
import { FileAudio, Play, ShieldCheck } from 'lucide-react';
import { nightjarEditorPortfolio, type EditorPortfolioItem } from '../platform/firebase-editor-portfolio';

export default function PublicEditorShowcase({ items }: { items: EditorPortfolioItem[] }) {
  const [urls,setUrls]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState<string|null>(null);

  const open=async(itemId:string,slot:'before'|'after')=>{
    const key=itemId+':'+slot;
    if(urls[key]) return;
    setLoading(key);
    try{
      const data=await nightjarEditorPortfolio.playback(itemId,slot);
      setUrls((current)=>({...current,[key]:data.url}));
    }finally{setLoading(null);}
  };

  if(!items?.length)return null;
  return <section className="public-editor-showcase">
    <div className="public-role-profile-head"><div><span className="mini-label">APPROVED AUDIO SHOWCASE</span><h3>Hear the editing work</h3></div><FileAudio size={18}/></div>
    <p className="panel-note">These samples were uploaded with rights/permission attestations and approved through Nightjar moderation. Playback links expire automatically.</p>
    <div className="public-editor-showcase-grid">
      {items.map((item)=><article key={item.id}>
        <strong>{item.title}</strong><p>{item.description}</p>
        {!![...(item.services??[]),...(item.techniques??[])].length&&<div className="creator-profile-tags">{[...(item.services??[]),...(item.techniques??[])].slice(0,8).map((x)=><span key={x}>{x}</span>)}</div>}
        <div className="public-editor-audio-pair">
          {item.beforeAudioAvailable&&<div><span>BEFORE</span>{urls[item.id+':before']?<audio controls preload="none" src={urls[item.id+':before']}/>:<button className="secondary-button" onClick={()=>void open(item.id,'before')} disabled={loading===item.id+':before'}><Play size={12}/> {loading===item.id+':before'?'Opening…':'Listen'}</button>}</div>}
          <div><span>{item.beforeAudioAvailable?'AFTER':'FINISHED SAMPLE'}</span>{urls[item.id+':after']?<audio controls preload="none" src={urls[item.id+':after']}/>:<button className="primary-button" onClick={()=>void open(item.id,'after')} disabled={loading===item.id+':after'}><Play size={12}/> {loading===item.id+':after'?'Opening…':'Listen'}</button>}</div>
        </div>
        <small><ShieldCheck size={11}/> Nightjar-moderated showcase</small>
      </article>)}
    </div>
  </section>;
}
