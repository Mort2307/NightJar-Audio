import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Heart, Megaphone, MessageSquareText, PenLine, Send, ShieldCheck } from 'lucide-react';
import { nightjarTeamCommunity, type TeamFeedback, type TeamPost, type TeamPostDraft, type TeamTopic } from '../platform/firebase-team-community';
import './nightjar-team-community.css';

type Props = { admin:boolean; readOnly?:boolean; notify:(message:string)=>void; demoMode?:boolean };
const EMPTY:TeamPostDraft={topic:'news',title:'',body:'',creatorName:'',status:'draft'};
const topics:Record<TeamTopic,string>={news:'Community update',celebration:'Creator celebration',you_said_we_did:'You said, we did'};
const dateText=(v:string|null)=>{
  if(!v)return '';
  const d=new Date(v);
  return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(d);
};

export default function NightjarTeamCommunity({admin,readOnly=false,notify,demoMode=false}:Props){
  const [posts,setPosts]=useState<TeamPost[]>([]);
  const [feedback,setFeedback]=useState<TeamFeedback[]>([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [busy,setBusy]=useState(false);
  const [editorOpen,setEditorOpen]=useState(false);
  const [draft,setDraft]=useState<TeamPostDraft>({...EMPTY});
  const [expanded,setExpanded]=useState(false);
  const [feedbackOpen,setFeedbackOpen]=useState(false);
  const [feedbackTopic,setFeedbackTopic]=useState('idea');
  const [feedbackMessage,setFeedbackMessage]=useState('');
  const [feedbackSent,setFeedbackSent]=useState(false);
  const [inboxOpen,setInboxOpen]=useState(false);
  const [showReviewed,setShowReviewed]=useState(false);
  const [reviewingId,setReviewingId]=useState('');

  const reload=async()=>{
    if(demoMode){setPosts([]);setFeedback([]);setLoading(false);return;}
    setLoading(true);setLoadError('');
    try{
      const data=await nightjarTeamCommunity.list();
      setPosts(data.posts??[]);setFeedback(admin?data.feedback??[]:[]);
    }catch{setLoadError('Updates could not be loaded. Try again.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{
    let active=true;
    if(demoMode){setPosts([]);setFeedback([]);setLoading(false);return;}
    setLoading(true);
    void nightjarTeamCommunity.list().then(data=>{
      if(!active)return;
      setPosts(data.posts??[]);
      setFeedback(admin?data.feedback??[]:[]);
      setLoadError('');
    }).catch(()=>{if(active)setLoadError('Updates could not be loaded. Try again.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[admin,demoMode]);

  const startPost=()=>{setDraft({...EMPTY});setEditorOpen(true);};
  const editPost=(post:TeamPost)=>{
    setDraft({id:post.id,expectedRevision:post.revision,topic:post.topic,title:post.title,body:post.body,creatorName:post.creatorName,status:post.status});
    setEditorOpen(true);
  };
  const savePost=async(status:TeamPostDraft['status'])=>{
    if(!admin||readOnly||demoMode||busy)return;
    if(draft.title.trim().length<5||draft.body.trim().length<15){notify('Add a clear title and at least 15 characters of text.');return;}
    setBusy(true);
    try{
      await nightjarTeamCommunity.save({...draft,status});
      setEditorOpen(false);setDraft({...EMPTY});
      notify(status==='published'?'Update published to the community.':status==='archived'?'Update archived.':'Draft saved privately.');
      await reload();
    }catch(error){
      const message=error instanceof Error?error.message:'';
      notify(message.includes('another device')?'This post was changed elsewhere. Reload before editing.':'Unable to save team update.');
    }finally{setBusy(false);}
  };
  const sendFeedback=async()=>{
    if(readOnly||demoMode||busy)return;
    if(feedbackMessage.trim().length<15){notify('Add at least 15 characters of feedback.');return;}
    setBusy(true);
    try{
      await nightjarTeamCommunity.sendFeedback(feedbackTopic,feedbackMessage.trim());
      setFeedbackMessage('');setFeedbackSent(true);setFeedbackOpen(false);
      notify('Your feedback was delivered privately to Nightjar.');
      if(admin)await reload();
    }catch(error){
      const message=error instanceof Error?error.message:'';
      notify(/ten minutes|daily feedback limit/i.test(message)?message:'Feedback could not be sent. Please try again.');
    }finally{setBusy(false);}
  };
  const markReviewed=async(id:string)=>{
    if(!admin||readOnly||demoMode)return;
    setReviewingId(id);
    try{
      await nightjarTeamCommunity.reviewFeedback(id);
      setFeedback(items=>items.map(item=>item.id===id?{...item,status:'reviewed'}:item));
      notify('Feedback marked as reviewed.');
    }catch{notify('Feedback status could not be updated.');}
    finally{setReviewingId('');}
  };
  const published=posts.filter(p=>p.status==='published');
  const privatePosts=admin?posts.filter(p=>p.status!=='published'):[];
  const displayed=expanded?published:published.slice(0,3);
  const pendingCount=feedback.filter(f=>f.status==='new').length;
  const inbox=feedback.filter(f=>showReviewed||f.status==='new');

  return <section id="nightjar-team-community" className="nightjar-team-space" aria-label="From the Nightjar Team">
    <div className="nightjar-team-heading">
      <div><p className="eyebrow"><ShieldCheck size={14}/> THE PEOPLE BEHIND NIGHTJAR</p>
        <h2>From the Nightjar Team.</h2>
        <p>Community updates, creative milestones and changes shaped by your feedback. We're here, we're listening, and we're growing Nightjar together.</p>
      </div>
      <div className="nightjar-team-emblem" aria-hidden="true"><Megaphone size={25}/></div>
    </div>
    {admin&&!readOnly&&!demoMode&&<div className="nightjar-team-buttons">
      <button type="button" className="primary-button" onClick={startPost}><PenLine size={14}/> Write an update</button>
      <button type="button" className="secondary-button" aria-expanded={inboxOpen} onClick={()=>setInboxOpen(x=>!x)}>
        <MessageSquareText size={14}/> Feedback inbox {pendingCount?'('+pendingCount+' new)':''}
      </button>
    </div>}
    {editorOpen&&admin&&!readOnly&&!demoMode&&<div className="nightjar-team-editor">
      <h3>{draft.id?'Edit team update':'Compose a team update'}</h3>
      <div className="nightjar-team-fields">
        <label>Update type<select value={draft.topic} onChange={e=>setDraft(d=>({...d,topic:e.target.value as TeamTopic}))}>
          <option value="news">Community update</option>
          <option value="celebration">Creator celebration</option>
          <option value="you_said_we_did">You said, we did</option>
        </select></label>
        <label>Headline<input maxLength={120} value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))} placeholder="A new chapter for Nightjar"/></label>
        {draft.topic==='celebration'&&<label>Creator name (optional)<input maxLength={100} value={draft.creatorName} onChange={e=>setDraft(d=>({...d,creatorName:e.target.value}))} placeholder="The creator we're celebrating"/></label>}
        <label className="nightjar-team-wide">Your update<textarea rows={5} maxLength={2400} value={draft.body} onChange={e=>setDraft(d=>({...d,body:e.target.value}))} placeholder="A meaningful update for the whole community."/><small>{draft.body.length}/2400</small></label>
      </div>
      <p className="nightjar-team-note">Only published posts are shown to members. Drafts and archived posts are admin-only. Get a creator's permission before sharing personal details.</p>
      <div className="nightjar-team-buttons">
        <button type="button" className="primary-button" disabled={busy} onClick={()=>void savePost('published')}><Send size={14}/>{busy?'Saving…':'Publish update'}</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={()=>void savePost('draft')}>Save draft</button>
        {draft.id&&<button type="button" className="ghost-button" disabled={busy} onClick={()=>void savePost('archived')}>Archive</button>}
        <button type="button" className="ghost-button" disabled={busy} onClick={()=>setEditorOpen(false)}>Cancel</button>
      </div>
    </div>}
    {inboxOpen&&admin&&!readOnly&&!demoMode&&<div className="nightjar-team-inbox">
      <div className="nightjar-team-inbox-heading"><h3>Private community feedback</h3><label><input type="checkbox" checked={showReviewed} onChange={e=>setShowReviewed(e.target.checked)}/> Show reviewed</label></div>
      <p className="nightjar-team-note">Feedback stays in the administrator inbox. There is no public comment approval queue.</p>
      {inbox.length?inbox.map(item=><article key={item.id} className="nightjar-team-inbox-item">
        <div className="nightjar-team-meta"><span>{item.topic}</span><span>{item.memberName}</span><time dateTime={item.createdAt??undefined}>{dateText(item.createdAt)}</time></div>
        <p>{item.message}</p>
        {item.status==='new'?<button type="button" className="secondary-button" disabled={reviewingId===item.id} onClick={()=>void markReviewed(item.id)}><CheckCircle2 size={13}/> Mark reviewed</button>:<span className="nightjar-team-note">Reviewed</span>}
      </article>):<p className="nightjar-team-empty">No feedback awaiting review.</p>}
    </div>}
    <div className="nightjar-team-feed" aria-live="polite">
      {loading&&<p className="nightjar-team-empty">Loading team updates…</p>}
      {!loading&&loadError&&<div className="nightjar-team-empty" role="alert">{loadError}<button type="button" className="secondary-button" onClick={()=>void reload()}>Retry</button></div>}
      {!loading&&!loadError&&!published.length&&<div className="nightjar-team-empty">
        <Megaphone size={22} aria-hidden="true"/><strong>No updates yet.</strong>
        <span>Updates from the Nightjar team will appear here.</span>
      </div>}
      {!loading&&!loadError&&displayed.map(post=><article className="nightjar-team-post" key={post.id}>
        <div className="nightjar-team-meta"><span className="nightjar-team-topic"><Megaphone size={13} aria-hidden="true"/>{topics[post.topic]??'Community update'}</span>
          {post.publishedAt&&<time dateTime={post.publishedAt}>{dateText(post.publishedAt)}</time>}
          <span className="nightjar-team-official"><ShieldCheck size={13}/> Official Nightjar Team</span>
        </div>
        <h3>{post.title}</h3>
        {post.topic==='celebration'&&post.creatorName&&<p className="nightjar-team-credit"><Heart size={14}/> Celebrating {post.creatorName}</p>}
        <p className="nightjar-team-post-body">{post.body}</p>
        {admin&&!readOnly&&!demoMode&&<button type="button" className="ghost-button" onClick={()=>editPost(post)}><PenLine size={13}/> Edit</button>}
      </article>)}
      {!loading&&!loadError&&published.length>3&&<button type="button" className="secondary-button nightjar-team-more" onClick={()=>setExpanded(x=>!x)}>{expanded?'Show latest updates':'Read all '+published.length+' updates'} <ArrowRight size={14}/></button>}
      {admin&&!readOnly&&!demoMode&&privatePosts.length>0&&<div className="nightjar-team-private">
        <h3>Drafts and archived posts · team only</h3>
        {privatePosts.map(post=><button type="button" key={post.id} className="nightjar-team-private-item" onClick={()=>editPost(post)}><span>{post.title}</span><small>{post.status} · {dateText(post.updatedAt)}</small><PenLine size={14}/></button>)}
      </div>}
    </div>
    <div className="nightjar-team-feedback-cta">
      <div><p className="eyebrow"><MessageSquareText size={13}/> YOUR VOICE MATTERS</p><h3>Help shape what comes next.</h3><p>Have an idea, something to celebrate, or something we could do better? Tell our team directly. Your message stays private.</p></div>
      {feedbackSent?<span className="nightjar-team-thanks"><CheckCircle2 size={16}/> Thanks — we received your feedback.</span>
        :<button type="button" className="secondary-button" disabled={readOnly||demoMode} aria-expanded={feedbackOpen} onClick={()=>setFeedbackOpen(x=>!x)}>{feedbackOpen?'Close feedback':'Share feedback'} <ArrowRight size={14}/></button>}
    </div>
    {feedbackOpen&&!readOnly&&!demoMode&&<div className="nightjar-team-feedback-form">
      <label>Feedback category<select value={feedbackTopic} onChange={e=>setFeedbackTopic(e.target.value)}><option value="idea">An idea</option><option value="appreciation">A little appreciation</option><option value="concern">Something to improve</option></select></label>
      <label>Your message<textarea rows={4} maxLength={1400} value={feedbackMessage} onChange={e=>setFeedbackMessage(e.target.value)} placeholder="How can we make Nightjar better for you?"/><small>{feedbackMessage.length}/1400</small></label>
      <button type="button" className="primary-button" disabled={busy||feedbackMessage.trim().length<15} onClick={()=>void sendFeedback()}><Send size={14}/>{busy?'Sending…':'Send privately to Nightjar'}</button>
      <p className="nightjar-team-note">Please don't include passwords, identity documents or other sensitive information. This isn't an emergency support channel.</p>
    </div>}
  </section>;
}
