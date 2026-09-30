import { useEffect, useRef, useState } from 'react';
import { Flag, Heart, MessageCircle, Send, Trash2, X } from 'lucide-react';
import { nightjarSocial } from '../platform/firebase-social';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';

type Props = {
  release: { id:string; title:string; creator?:string };
  role: 'admin'|'creator'|'listener'|'writer'|'editor'|null;
  currentUserId?: string | null;
  onClose: () => void;
  notify: (message:string) => void;
  demoMode?: boolean;
  simulationMode?: boolean;
};

export default function ReleaseCommunity({ release, role, currentUserId, onClose, notify, demoMode=false, simulationMode=false }: Props) {
  const [data,setData]=useState<any>({loveCount:0,lovedByMe:false,comments:[],canInteract:role==='listener'});
  const [body,setBody]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const dialogRef=useRef<HTMLElement|null>(null);
  useDialogFocusTrap(dialogRef,{onEscape:onClose});

  const load=async()=>{
    setLoading(true);
    try{
      if(demoMode){
        setData({
          loveCount:18,
          lovedByMe:false,
          canInteract:role==='listener',
          comments:[
            {id:'demo-comment-1',userId:'demo-listener-jamie',commenterName:'Jamie',commenterHandle:'jamielistens',body:'The production on this one is gorgeous — the pacing really worked for me.',createdAt:new Date(Date.now()-3600000).toISOString()},
            {id:'demo-comment-2',userId:'demo-listener-lex',commenterName:'Lex',commenterHandle:'lexlistens',body:'Really liked the final section. Would absolutely listen to another entry in this series.',createdAt:new Date(Date.now()-1800000).toISOString()},
          ],
        });
      }else{
        setData(await nightjarSocial.community(release.id));
      }
    }catch{notify('Release community could not be loaded.');}
    finally{setLoading(false);}
  };

  useEffect(()=>{void load();},[release.id,demoMode,role]);

  const toggleLove=async()=>{
    if(role!=='listener') return notify('Love reactions are available to Listener accounts.');
    try{
      const next=!data.lovedByMe;
      if(demoMode){
        if(!simulationMode) return notify('Start Listener Simulation to change the demo community.');
        setData((current:any)=>({...current,lovedByMe:next,loveCount:Math.max(0,current.loveCount+(next?1:-1))}));
      }else{
        const result=await nightjarSocial.love(release.id,next);
        setData((current:any)=>({...current,lovedByMe:result.loved,loveCount:result.loveCount}));
      }
    }catch{notify('Love reaction could not be updated.');}
  };

  const submit=async()=>{
    const text=body.trim();
    if(!text) return;
    if(role!=='listener') return notify('Comments are available to Listener accounts.');
    setSaving(true);
    try{
      if(demoMode){
        if(!simulationMode) return notify('Start Listener Simulation to comment on demo work.');
        const comment={id:'demo-comment-'+Date.now(),userId:currentUserId??'demo-self',commenterName:'You',commenterHandle:null,body:text,createdAt:new Date().toISOString()};
        setData((current:any)=>({...current,comments:[...current.comments,comment]}));
      }else{
        const result=await nightjarSocial.comment(release.id,text);
        setData((current:any)=>({...current,comments:[...current.comments,result.comment]}));
      }
      setBody('');
      notify('Comment posted.');
    }catch(error){
      const message=error instanceof Error?error.message:'';
      notify(message.includes('wait before posting')?'Please wait before posting more comments.':'Comment could not be posted.');
    }finally{setSaving(false);}
  };

  const remove=async(comment:any)=>{
    if(!window.confirm('Delete this comment?')) return;
    try{
      if(demoMode){
        setData((current:any)=>({...current,comments:current.comments.filter((item:any)=>item.id!==comment.id)}));
      }else{
        await nightjarSocial.deleteComment(comment.id);
        setData((current:any)=>({...current,comments:current.comments.filter((item:any)=>item.id!==comment.id)}));
      }
      notify('Comment deleted.');
    }catch{notify('Comment could not be deleted.');}
  };

  const report=async(comment:any)=>{
    const reason=window.prompt('What should Nightjar moderation review about this comment?')?.trim();
    if(reason==null) return;
    try{
      if(!demoMode) await nightjarSocial.reportComment(comment.id,reason);
      notify('Comment reported for Administrator review.');
    }catch{notify('Comment could not be reported.');}
  };

  return <div className="release-community-backdrop" role="dialog" aria-modal="true" aria-label={'Community for '+release.title} onMouseDown={onClose}>
    <section ref={dialogRef} tabIndex={-1} className="release-community-modal" onMouseDown={(event)=>event.stopPropagation()}>
      <header className="release-community-head">
        <div><span className="mini-label">PUBLISHED WORK / COMMUNITY</span><h2>{release.title}</h2><p>{release.creator??'Nightjar creator'} · public Listener discussion</p></div>
        <button className="icon-button" onClick={onClose} aria-label="Close release community"><X size={18}/></button>
      </header>

      <div className="release-community-love">
        <button className={data.lovedByMe?'release-love-button loved':'release-love-button'} onClick={()=>void toggleLove()} disabled={role!=='listener'} aria-pressed={data.lovedByMe}>
          <Heart size={18} fill={data.lovedByMe?'currentColor':'none'}/><strong>{data.lovedByMe?'Loved':'Love this work'}</strong>
        </button>
        <div><strong>{data.loveCount??0}</strong><span>Listener love{data.loveCount===1?'':'s'}</span></div>
        <p>Love counts are public. Nightjar does not publish a list of which Listeners loved a release.</p>
      </div>

      {role==='listener'?<article className="release-comment-compose">
        <span className="mini-label">JOIN THE DISCUSSION</span>
        <textarea value={body} maxLength={800} onChange={(event)=>setBody(event.target.value)} placeholder="Comment on the published work, performance, story or production…"/>
        <div><small>{body.length}/800 · comments are public and can be reported</small><button className="primary-button" disabled={saving||!body.trim()} onClick={()=>void submit()}><Send size={13}/>{saving?'Posting…':'Post comment'}</button></div>
      </article>:<div className="release-community-readonly"><MessageCircle size={15}/><span>You can read the public discussion. Posting and Love reactions are reserved for Listener accounts.</span></div>}

      <div className="release-comment-list">
        <div className="release-comment-list-head"><span className="mini-label">COMMENTS</span><strong>{data.comments?.length??0} public comment{data.comments?.length===1?'':'s'}</strong></div>
        {loading?<div className="people-empty">Loading discussion…</div>:(data.comments??[]).length===0?<div className="people-empty"><MessageCircle size={18}/><strong>No comments yet.</strong><span>Listener discussion will appear here without replacing structured reviews.</span></div>:(data.comments??[]).map((comment:any)=>{
          const own=Boolean(currentUserId&&comment.userId===currentUserId)||(demoMode&&comment.commenterName==='You');
          return <article className="release-comment" key={comment.id}>
            <div className="release-comment-meta"><div><strong>{comment.commenterName??'Nightjar listener'}</strong>{comment.commenterHandle&&<span>@{String(comment.commenterHandle).replace(/^@/,'')}</span>}</div><time>{comment.createdAt?new Date(comment.createdAt).toLocaleString('en-GB'):''}</time></div>
            <p>{comment.body}</p>
            <div className="release-comment-actions">{own?<button className="text-button" onClick={()=>void remove(comment)}><Trash2 size={12}/> Delete</button>:<button className="text-button" onClick={()=>void report(comment)}><Flag size={12}/> Report</button>}</div>
          </article>;
        })}
      </div>
    </section>
  </div>;
}
