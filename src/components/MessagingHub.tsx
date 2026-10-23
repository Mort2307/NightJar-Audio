import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, BellRing, Check, CheckCheck, CircleCheckBig, Clock3, Flag, Handshake, MessageCircle, RefreshCw, Search, Send, ShieldCheck } from 'lucide-react';
import { nightjarMessaging } from '../platform/firebase-messaging';
import { nightjarCollaboration } from '../platform/firebase-collaboration';
import './messaging-human-first.css';

type Role='creator'|'writer'|'editor'|'artist'|'admin';

type Props={
  role:Role;
  currentUserId?:string|null;
  initialRecipientUserId?:string|null;
  initialConversationId?:string|null;
  initialCollaborationId?:string|null;
  onRecipientHandled?:()=>void;
  onUnreadChange?:(count:number)=>void;
  onStatusChange?:(status:{unread:number;needsReply:number;awaitingReply:number})=>void;
  notify:(message:string)=>void;
  demoMode?:boolean;
  simulationMode?:boolean;
};

type MessageTargetEvent=CustomEvent<{userId?:string;collaborationId?:string|null}>;

const roleLabel=(role:string)=>role==='admin'?'Nightjar Admin':role==='editor'?'Audio Editor':role==='writer'?'Writer':role==='artist'?'Artist':'VA Creator';

export default function MessagingHub({role,currentUserId,initialRecipientUserId,initialConversationId,initialCollaborationId,onRecipientHandled,onUnreadChange,onStatusChange,notify,demoMode=false,simulationMode=false}:Props){
  const [conversations,setConversations]=useState<any[]>([]);
  const [directory,setDirectory]=useState<any[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [messages,setMessages]=useState<any[]>([]);
  const [query,setQuery]=useState('');
  const [inboxFilter,setInboxFilter]=useState<'all'|'unread'|'needs_reply'|'awaiting_reply'>('all');
  // Private unsent text belongs to its intended conversation, never to a shared composer.
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [inboxError,setInboxError]=useState(false);
  const [threadError,setThreadError]=useState(false);
  const [threadLoading,setThreadLoading]=useState(false);
  const [mobileThreadOpen,setMobileThreadOpen]=useState(false);
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [reminding,setReminding]=useState(false);
  const [blocked,setBlocked]=useState(false);
  const [blockedByMe,setBlockedByMe]=useState(false);
  const [blockedByOther,setBlockedByOther]=useState(false);
  const [activeCollaborationId,setActiveCollaborationId]=useState<string|null>(null);
  const messageListRef=useRef<HTMLDivElement|null>(null);
  const selectedIdRef=useRef<string|null>(null);
  const viewerIdRef=useRef<string|null>(null);
  const threadRequestRef=useRef(0);
  const sendingRef=useRef(false);
  const shouldFollowMessagesRef=useRef(true);

  const viewerId=demoMode?(currentUserId??'demo-self'):(currentUserId??'');
  const body=selectedId?(drafts[selectedId]??''):'';

  const openThread=(id:string,collaborationId:string|null=null)=>{
    if(selectedIdRef.current===id){
      setMobileThreadOpen(true);
      if(collaborationId)setActiveCollaborationId(collaborationId);
      return;
    }
    selectedIdRef.current=id;
    threadRequestRef.current+=1; // Ignore a previous recipient's in-flight response.
    setSelectedId(id);
    setActiveCollaborationId(collaborationId);
    setMessages([]);
    setBlocked(false);
    setBlockedByMe(false);
    setBlockedByOther(false);
    setThreadError(false);
    setThreadLoading(true);
    setMobileThreadOpen(true);
    shouldFollowMessagesRef.current=true;
  };

  const loadConversations=async(silent=false)=>{
    if(!silent)setLoading(true);
    try{
      if(demoMode){
        const demoConversations=[
          {id:'demo-professional-1',otherUserId:'demo-writer-mara',otherName:'Mara Bell',otherHandle:'marabell',otherRole:'writer',lastMessage:'I updated the rights note — happy to talk through the changes.',lastMessageAt:new Date(Date.now()-1200000).toISOString(),lastSenderUserId:'demo-writer-mara',waitingState:'awaiting_me',waitingHours:0,reminderEligible:false,reminderAlreadySent:false,unreadCount:1,collaborationId:'demo-collab-1',collaborationIds:['demo-collab-1','demo-collab-2'],collaborations:[{id:'demo-collab-1',title:'Midnight Call',status:'discussing'},{id:'demo-collab-2',title:'After Hours',status:'accepted'}]},
          {id:'demo-professional-2',otherUserId:'demo-editor-sam',otherName:'Sam Reed',otherHandle:'samreed',otherRole:'editor',lastMessage:'Just checking whether the latest production handoff reached you.',lastMessagePreview:'Just checking whether the latest production handoff reached you.',lastMessageAt:new Date(Date.now()-72*60*60*1000).toISOString(),lastSenderUserId:viewerId,waitingState:'awaiting_them',waitingHours:72,reminderEligible:true,reminderAlreadySent:false,unreadCount:0,collaborationIds:[]},
        ];
        setConversations(demoConversations);
        setInboxError(false);
      }else{
        const data=await nightjarMessaging.conversations();
        setConversations(data.conversations??[]);
        setInboxError(false);
      }
    }catch{setInboxError(true);if(!silent)notify('Messages could not be loaded. Existing conversations remain visible.');}
    finally{if(!silent)setLoading(false);}
  };

  const loadDirectory=async()=>{
    try{
      if(demoMode){
        setDirectory([
          {userId:'demo-writer-mara',role:'writer',name:'Mara Bell',handle:'marabell',headline:'Dialogue-first Writer'},
          {userId:'demo-creator-noah',role:'creator',name:'Noah Vale',handle:'noahvale',headline:'Character-led Creator'},
          {userId:'demo-editor-sam',role:'editor',name:'Sam Reed',handle:'samreed',headline:'Dialogue editing and production polish'},
          {userId:'demo-artist-lena',role:'artist',name:'Lena Moss',handle:'lenamoss',headline:'Illustration, cover art and character artwork'},
        ].filter((item)=>item.userId!==currentUserId));
      }else{
        const data=await nightjarCollaboration.directory();
        setDirectory((data.people??[]).filter((item:any)=>['creator','writer','editor','artist'].includes(String(item.role))&&item.userId!==currentUserId));
      }
    }catch{/* existing conversations still work */}
  };

  const loadMessages=async(conversationId:string,quiet=false)=>{
    const requestId=++threadRequestRef.current;
    if(!quiet){setThreadLoading(true);setThreadError(false);}
    try{
      if(demoMode){
        const selected=conversations.find((item)=>item.id===conversationId);
        if(selectedIdRef.current!==conversationId||requestId!==threadRequestRef.current)return;
        setMessages([
          {id:'demo-message-1',conversationId,senderUserId:selected?.otherUserId??'demo-writer-mara',body:'I wanted to keep this conversation attached to Nightjar so the collaboration does not disappear into another inbox.',readBy:[selected?.otherUserId??'demo-writer-mara',viewerId],readAt:{[viewerId]:new Date(Date.now()-3500000).toISOString(),[selected?.otherUserId??'demo-writer-mara']:new Date(Date.now()-3400000).toISOString()},createdAt:new Date(Date.now()-3600000).toISOString(),collaborationId:'demo-collab-1'},
          {id:'demo-message-2',conversationId,senderUserId:viewerId,body:'Perfect. I can see the proposal state and message history together now.',readBy:[viewerId,selected?.otherUserId??'demo-writer-mara'],readAt:{[viewerId]:new Date(Date.now()-3000000).toISOString(),[selected?.otherUserId??'demo-writer-mara']:new Date(Date.now()-2600000).toISOString()},createdAt:new Date(Date.now()-3000000).toISOString(),collaborationId:'demo-collab-1'},
        ]);
        setBlocked(false);
        setBlockedByMe(false);
        setBlockedByOther(false);
        setConversations((items)=>items.map((item)=>item.id===conversationId?{...item,unreadCount:0}:item));
      }else{
        const data=await nightjarMessaging.open(conversationId);
        if(selectedIdRef.current!==conversationId||requestId!==threadRequestRef.current)return;
        setMessages(data.messages??[]);
        const activeConversation=data.conversation??{};
        setActiveCollaborationId((current)=>current && (activeConversation.collaborationIds??[]).includes(current) ? current : activeConversation.collaborationId ?? activeConversation.collaborations?.[activeConversation.collaborations.length-1]?.id ?? null);
        setBlocked(data.blocked===true);
        setBlockedByMe(data.blockedByMe===true);
        setBlockedByOther(data.blockedByOther===true);
        setConversations((items)=>(data.conversations??items).map((item:any)=>item.id===conversationId?{...item,...activeConversation,unreadCount:0}:item));
      }
      if(selectedIdRef.current===conversationId&&requestId===threadRequestRef.current)setThreadError(false);
    }catch{
      if(selectedIdRef.current===conversationId&&requestId===threadRequestRef.current){
        setThreadError(true);
        if(!quiet)notify('Conversation could not be loaded. Your draft is unchanged.');
      }
    }finally{
      if(selectedIdRef.current===conversationId&&requestId===threadRequestRef.current)setThreadLoading(false);
    }
  };

  const startWith=async(targetUserId:string,collaborationId:string|null=null)=>{
    try{
      if(demoMode){
        const existing=conversations.find((item)=>item.otherUserId===targetUserId);
        const person=directory.find((item)=>item.userId===targetUserId);
        const id=existing?.id??'demo-professional-'+targetUserId;
        if(!existing)setConversations((items)=>[{id,otherUserId:targetUserId,otherName:person?.name??'Demo collaborator',otherHandle:person?.handle??null,otherRole:person?.role??null,lastMessage:'',lastMessageAt:null,unreadCount:0,collaborationIds:collaborationId?[collaborationId]:[]},...items]);
        openThread(id,collaborationId);
      }else{
        const data=await nightjarMessaging.start(targetUserId,'',collaborationId??undefined);
        const id=data.conversation?.id;
        if(!id)throw new Error('Conversation id missing');
        openThread(id,collaborationId);
        await loadConversations(true);
      }
      onRecipientHandled?.();
    }catch(error){
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      const detail = error instanceof Error ? error.message : '';
      notify(code.includes('not-found') || /Eligible creative account not found/i.test(detail)
        ? 'This person cannot receive a private conversation yet. If you are reviewing their manuscript, use its Writer-visible review thread instead.'
        : code.includes('permission-denied') || /blocked between/i.test(detail)
          ? 'This conversation is unavailable because of account or messaging permissions.'
          : 'Conversation could not be opened. Please retry.');
    }
  };

  useEffect(()=>{void loadConversations();void loadDirectory();},[role,demoMode]);
  useEffect(()=>{
    if(viewerIdRef.current===null){viewerIdRef.current=viewerId;return;}
    if(viewerIdRef.current===viewerId)return;
    viewerIdRef.current=viewerId;
    setDrafts({});
    setMessages([]);
    setSelectedId(null);
    selectedIdRef.current=null;
    threadRequestRef.current+=1;
    setMobileThreadOpen(false);
  },[viewerId]);
  useEffect(()=>{if(initialRecipientUserId)void startWith(initialRecipientUserId,initialCollaborationId??null);},[initialRecipientUserId,initialCollaborationId]);
  useEffect(()=>{
    if(!initialConversationId)return;
    openThread(initialConversationId,initialCollaborationId??null);
    onRecipientHandled?.();
  },[initialConversationId]);

  useEffect(()=>{
    const node=messageListRef.current;
    if(!node)return;
    if(shouldFollowMessagesRef.current)node.scrollTop=node.scrollHeight;
  },[messages.length,selectedId]);

  useEffect(()=>{
    const onMessageUser=(event:Event)=>{
      const detail=(event as MessageTargetEvent).detail??{};
      if(detail.userId)void startWith(detail.userId,detail.collaborationId??null);
    };
    window.addEventListener('nightjar:message-user',onMessageUser);
    return()=>window.removeEventListener('nightjar:message-user',onMessageUser);
  },[conversations,directory]);
  useEffect(()=>{
    if(!selectedId)return;
    void loadMessages(selectedId);
    if(demoMode)return;
    const timer=window.setInterval(()=>void loadMessages(selectedId,true),20000);
    return()=>window.clearInterval(timer);
  },[selectedId,demoMode]);

  const selectConversation=(conversation:any)=>{
    const collaborationId=conversation.collaborationId ?? conversation.collaborations?.[conversation.collaborations.length-1]?.id ?? null;
    openThread(conversation.id,collaborationId);
  };

  const filteredPeople=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    return directory.filter((person:any)=>{
      if(!needle)return true;
      return [person.name,person.handle,person.headline,person.role,...(person.roleSpecialties??[]),...(person.favouriteTags??[])].filter(Boolean).join(' ').toLowerCase().includes(needle);
    }).slice(0,30);
  },[directory,query]);

  const send=async()=>{
    const conversationId=selectedId;
    const collaborationId=activeCollaborationId;
    const text=body.trim();
    if(!conversationId||!text||blocked||threadLoading||threadError||sendingRef.current)return;
    sendingRef.current=true;setSending(true);
    try{
      if(demoMode){
        if(!simulationMode){notify('Start a creative-role Simulation to send demo messages.');return;}
        const message={id:'demo-message-'+Date.now(),conversationId,senderUserId:viewerId,body:text,createdAt:new Date().toISOString(),collaborationId};
        if(selectedIdRef.current===conversationId)setMessages((items)=>[...items,message]);
        setConversations((items)=>items.map((item)=>item.id===conversationId?{...item,lastMessage:text,lastMessageAt:message.createdAt}:item));
      }else{
        const result=await nightjarMessaging.send(conversationId,text,collaborationId);
        if(selectedIdRef.current===conversationId&&result.message){
          setMessages((items)=>items.some((item)=>item.id===result.message.id)?items:[...items,result.message]);
        }
        await loadConversations(true);
      }
      setDrafts((current)=>{
        if((current[conversationId]??'').trim()!==text)return current;
        const next={...current};delete next[conversationId];return next;
      });
    }catch(error){
      const message=error instanceof Error?error.message:'';
      notify(message.includes('blocked')?'Messaging is blocked between these accounts. Your draft is kept.':message.includes('slow')?'Please slow down before sending more messages. Your draft is kept.':'Message could not be sent. Your draft is kept; check the conversation before retrying.');
    }finally{sendingRef.current=false;setSending(false);}
  };

  const report=async(message:any)=>{
    const reason=window.prompt('What should Nightjar moderation review about this message?')?.trim();
    if(reason==null)return;
    try{
      if(!demoMode&&selectedId)await nightjarMessaging.report(selectedId,message.id,reason);
      notify('Message reported for Administrator review.');
    }catch{notify('Message could not be reported.');}
  };

  const selected=conversations.find((item)=>item.id===selectedId)??null;
  const waitingState=(conversation:any)=>{
    if(conversation?.waitingState)return String(conversation.waitingState);
    if(!conversation?.lastSenderUserId)return 'none';
    return String(conversation.lastSenderUserId)===String(viewerId)?'awaiting_them':'awaiting_me';
  };
  const waitingHours=(conversation:any)=>{
    if(Number.isFinite(Number(conversation?.waitingHours)))return Math.max(0,Number(conversation.waitingHours));
    const sentAt=conversation?.lastMessageAt?new Date(conversation.lastMessageAt).getTime():0;
    return sentAt>0?Math.max(0,Math.floor((Date.now()-sentAt)/3600000)):0;
  };
  const awaitingReply=(conversation:any)=>waitingState(conversation)==='awaiting_them'&&waitingHours(conversation)>=48;
  const needsReply=(conversation:any)=>waitingState(conversation)==='awaiting_me';

  const sendReminder=async()=>{
    if(!selectedId||!selected||reminding||blocked)return;
    const eligible=selected.reminderEligible===true || (awaitingReply(selected)&&selected.reminderAlreadySent!==true);
    if(!eligible)return notify('A follow-up reminder becomes available after 48 hours without a reply.');
    setReminding(true);
    try{
      if(demoMode){
        if(!simulationMode)return notify('Start a creative-role Simulation to send a demo reminder.');
        setConversations((items)=>items.map((item)=>item.id===selectedId?{...item,reminderEligible:false,reminderAlreadySent:true,lastReminderAt:new Date().toISOString()}:item));
      }else{
        await nightjarMessaging.remind(selectedId);
        await loadConversations(true);
      }
      notify('One follow-up reminder was sent. Another is not available until this person replies and a new unanswered message starts a new waiting period.');
    }catch(error){
      const message=error instanceof Error?error.message:'';
      notify(message.includes('already')?'A reminder has already been sent for this unanswered message.':message.includes('48 hours')?'The reminder becomes available after 48 hours without a reply.':'Follow-up reminder could not be sent.');
    }finally{setReminding(false);}
  };

  const closeLoop=async()=>{
    if(!selectedId||!selected)return;
    try{
      if(demoMode){
        if(!simulationMode)return notify('Start a creative-role Simulation to close a demo message loop.');
        setConversations((items)=>items.map((item)=>item.id===selectedId?{...item,waitingState:'resolved',resolved:true,resolvedAt:new Date().toISOString(),reminderEligible:false}:item));
      }else{
        await nightjarMessaging.closeLoop(selectedId);
        await loadConversations(true);
      }
      notify('Conversation loop closed. A new message will reopen it automatically.');
    }catch{notify('Conversation loop could not be closed.');}
  };

  const toggleBlock=async()=>{
    if(!selected?.otherUserId)return;
    const next=!blockedByMe;
    try{
      if(!demoMode)await nightjarMessaging.setBlocked(selected.otherUserId,next);
      setBlockedByMe(next);
      setBlocked(next||blockedByOther);
      notify(next?'You blocked private messages from this account.':'Your messaging block was removed.');
    }catch{notify('Messaging block could not be changed.');}
  };

  const unreadTotal=conversations.reduce((sum,item)=>sum+Number(item.unreadCount??0),0);
  const needsReplyTotal=conversations.filter((item)=>needsReply(item)).length;
  const awaitingReplyTotal=conversations.filter((item)=>awaitingReply(item)).length;
  const visibleConversations=useMemo(()=>conversations.filter((item)=>{
    if(inboxFilter==='unread' && Number(item.unreadCount??0)<=0)return false;
    if(inboxFilter==='needs_reply' && !needsReply(item))return false;
    if(inboxFilter==='awaiting_reply' && !awaitingReply(item))return false;
    const needle=query.trim().toLowerCase();
    if(!needle)return true;
    return [item.otherName,item.otherHandle,item.otherRole,item.lastMessagePreview,item.lastMessage]
      .filter(Boolean).join(' ').toLowerCase().includes(needle);
  }),[conversations,inboxFilter,viewerId,query]);

  useEffect(()=>{
    onUnreadChange?.(unreadTotal);
    onStatusChange?.({ unread:unreadTotal, needsReply:needsReplyTotal, awaitingReply:awaitingReplyTotal });
  },[unreadTotal,needsReplyTotal,awaitingReplyTotal]);


  return <section className="messaging-hub" id="nightjar-messaging-hub">
    <div className="messaging-hub-head">
      <div><span className="mini-label">PRIVATE PROFESSIONAL MESSAGING</span><h2>Keep the conversation with the work.</h2><p>VA Creators, Writers, Audio Editors and Artists can message each other directly, with unread state, collaboration context, blocking and reporting built in.</p></div>
      <div className="messaging-head-actions"><span className="status-pill">{unreadTotal} unread</span>{needsReplyTotal>0&&<span className="status-pill messaging-priority-pill">{needsReplyTotal} need reply</span>}{awaitingReplyTotal>0&&<span className="status-pill muted">{awaitingReplyTotal} awaiting</span>}<button className="secondary-button" onClick={()=>void loadConversations()}><RefreshCw size={13}/> Refresh</button></div>
    </div>
    <div className="messaging-safety-note"><ShieldCheck size={16}/><div><strong>A message is not a manuscript permission.</strong><span>Listeners cannot enter these DMs. Full scripts stay in Protected Reader / controlled sharing. Nightjar keeps reply responsibility visible, lets either professional close a finished loop, and allows only one reminder per unanswered message streak after 48 hours.</span></div></div>

    <div className={mobileThreadOpen?'messaging-layout thread-open':'messaging-layout'}>
      <aside className="messaging-sidebar">
        <label className="messaging-search"><Search size={16}/><input aria-label="Search conversations or professionals" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search inbox or find a professional…"/></label>
        {!!query.trim()&&<div className="messaging-directory" aria-label="Professional directory matches"><p className="messaging-section-label">START A CONVERSATION</p>{filteredPeople.filter((person:any)=>!conversations.some((item)=>item.otherUserId===person.userId)).map((person:any)=><button key={person.userId} onClick={()=>void startWith(person.userId)}><span>{String(person.name??'NJ').split(' ').map((part:string)=>part[0]).join('').slice(0,2)}</span><div><strong>{person.name}</strong><small>{roleLabel(person.role)}{person.handle?' · @'+String(person.handle).replace(/^@/,''):''}</small></div></button>)}{!filteredPeople.some((person:any)=>!conversations.some((item)=>item.otherUserId===person.userId))&&<div className="people-empty">No new contacts match. Check your inbox results below.</div>}</div>}
        <div className="messaging-conversations">
          <div className="messaging-conversation-head"><span className="mini-label">CONVERSATIONS</span><strong>{visibleConversations.length}</strong></div>
          <div className="messaging-filter-tabs" role="tablist" aria-label="Message inbox filters">
            <button type="button" role="tab" aria-selected={inboxFilter==='all'} className={inboxFilter==='all'?'active':''} onClick={()=>setInboxFilter('all')}>All <span>{conversations.length}</span></button>
            <button type="button" role="tab" aria-selected={inboxFilter==='unread'} className={inboxFilter==='unread'?'active':''} onClick={()=>setInboxFilter('unread')}>Unread <span>{unreadTotal}</span></button>
            <button type="button" role="tab" aria-selected={inboxFilter==='needs_reply'} className={inboxFilter==='needs_reply'?'active':''} onClick={()=>setInboxFilter('needs_reply')}>Needs reply <span>{needsReplyTotal}</span></button>
            <button type="button" role="tab" aria-selected={inboxFilter==='awaiting_reply'} className={inboxFilter==='awaiting_reply'?'active':''} onClick={()=>setInboxFilter('awaiting_reply')}>Awaiting <span>{awaitingReplyTotal}</span></button>
          </div>
          {inboxError&&<div className="messaging-load-error" role="alert">Couldn't refresh your inbox. Existing conversations remain available. <button type="button" className="text-button" onClick={()=>void loadConversations()}>Try again</button></div>}
          {loading?<div className="people-empty" role="status">Loading messages…</div>:inboxError&&!conversations.length?<div className="people-empty">Your inbox is unavailable. Use Try again to reconnect.</div>:visibleConversations.length?visibleConversations.map((conversation:any)=><button type="button" aria-current={selectedId===conversation.id?'true':undefined} className={selectedId===conversation.id?'active':''} key={conversation.id} onClick={()=>selectConversation(conversation)}><span className="messaging-avatar">{conversation.otherAvatarUrl?<img className="avatar-approved-image" src={conversation.otherAvatarUrl} alt="" loading="lazy" decoding="async"/>:String(conversation.otherName??'NJ').split(' ').map((part:string)=>part[0]).join('').slice(0,2)}</span><div><strong>{conversation.otherName}</strong><small>{conversation.lastMessagePreview||'Conversation ready'}</small>{needsReply(conversation)?<span className="messaging-needs-reply"><Clock3 size={10}/> Reply needed</span>:awaitingReply(conversation)?<span className={conversation.reminderAlreadySent?'messaging-awaiting-reply reminder-sent':'messaging-awaiting-reply'}><Clock3 size={10}/>{conversation.reminderAlreadySent?'Reminder sent · still awaiting reply':'Awaiting reply · '+waitingHours(conversation)+'h'}</span>:waitingState(conversation)==='awaiting_them'?<span className="messaging-awaiting-reply"><Clock3 size={10}/> Awaiting reply</span>:waitingState(conversation)==='resolved'?<span className="messaging-loop-resolved"><CircleCheckBig size={10}/> Loop closed</span>:null}</div>{conversation.unreadCount>0&&<em>{conversation.unreadCount}</em>}</button>):<div className="people-empty"><MessageCircle size={16}/><strong>{conversations.length?'No conversations match your search or filter.':'No conversations yet.'}</strong><span>{conversations.length?'Choose another Inbox filter.':'Search for a VA Creator, Writer, Audio Editor or Artist to start one.'}</span></div>}
        </div>
      </aside>

      <div className="messaging-thread">
        {selected?<><header><button type="button" className="messaging-back-to-inbox" onClick={()=>setMobileThreadOpen(false)}>← Inbox</button><div><span className="mini-label">PRIVATE THREAD</span><h3>{selected.otherName}</h3><p>{selected.otherRole?roleLabel(selected.otherRole)+' · ':''}{selected.otherHandle?'@'+String(selected.otherHandle).replace(/^@/,''):'Nightjar professional account'}{needsReply(selected)?' · your reply is expected':awaitingReply(selected)?' · waiting '+waitingHours(selected)+'h for a reply':waitingState(selected)==='awaiting_them'?' · awaiting their reply':waitingState(selected)==='resolved'?' · loop closed — no reply needed':''}</p></div><div className="messaging-thread-actions">{waitingState(selected)!=='resolved'&&waitingState(selected)!=='none'&&<button className="ghost-button" onClick={()=>void closeLoop()}><CircleCheckBig size={12}/> Close loop</button>}{(selected.reminderEligible===true || (awaitingReply(selected)&&selected.reminderAlreadySent!==true))&&<button className="secondary-button" disabled={reminding||blocked} onClick={()=>void sendReminder()}><BellRing size={12}/>{reminding?'Sending…':'Send one reminder'}</button>}{selected.reminderAlreadySent&&waitingState(selected)!=='resolved'&&<span className="messaging-reminder-sent"><Check size={11}/> Reminder sent</span>}<button className={blockedByMe?'secondary-button':'ghost-button'} onClick={()=>void toggleBlock()}><Ban size={12}/>{blockedByMe?'Unblock':'Block messages'}</button></div></header>
          <div className="messaging-responsibility-bar">
            <div className={needsReply(selected)?'needs-reply':waitingState(selected)==='awaiting_them'?'awaiting-reply':waitingState(selected)==='resolved'?'resolved':'clear'}>
              {needsReply(selected)?<Clock3 size={14}/>:waitingState(selected)==='awaiting_them'?<Clock3 size={14}/>:<CircleCheckBig size={14}/>}
              <span><strong>{needsReply(selected)?'Your reply is the next step':waitingState(selected)==='awaiting_them'?'You are waiting for their reply':waitingState(selected)==='resolved'?'Conversation loop closed':'No outstanding reply'}</strong><small>{needsReply(selected)?'Reading the thread does not clear this responsibility — replying or deliberately closing the loop does.':waitingState(selected)==='awaiting_them'?(waitingHours(selected)>=48?'This has been unanswered for '+waitingHours(selected)+' hours. One Nightjar reminder can be sent for this waiting period.':'Your latest message is waiting for a response.'):waitingState(selected)==='resolved'?'Either professional can reopen the loop by sending a new message.':'Start a message when there is a concrete next step to discuss.'}</small></span>
            </div>
            {selected.otherReadAt && waitingState(selected)==='awaiting_them' && <span className="messaging-last-seen"><CheckCheck size={12}/> Conversation opened {new Date(selected.otherReadAt).toLocaleString('en-GB')}</span>}
          </div>
          {!!selected.collaborations?.length && <div className="messaging-collaboration-context">
            <Handshake size={15}/>
            <div className="messaging-collaboration-context-main">
              <span className="mini-label">PROJECT CONTEXT</span>
              <strong>{selected.collaborations.length === 1 ? 'Linked Nightjar collaboration' : selected.collaborations.length + ' linked Nightjar collaborations'}</strong>
              <small>Choose which verified project this message belongs to. Messaging never changes script rights, permissions or collaboration state.</small>
              <div className="messaging-project-contexts">
                {selected.collaborations.map((item:any)=><button type="button" key={item.id} className={activeCollaborationId===item.id?'active':''} onClick={()=>setActiveCollaborationId(item.id)} aria-pressed={activeCollaborationId===item.id}>
                  <span>{item.title}</span><small>{item.status ? String(item.status).replaceAll('_',' ') : 'Nightjar collaboration'}</small>
                </button>)}
                <button type="button" className={activeCollaborationId==null?'active':''} onClick={()=>setActiveCollaborationId(null)} aria-pressed={activeCollaborationId==null}><span>General conversation</span><small>No project context</small></button>
              </div>
            </div>
          </div>}
          <div className="message-list" ref={messageListRef} role="log" aria-label={'Conversation with '+String(selected.otherName??'Nightjar member')} onScroll={(event)=>{const node=event.currentTarget;shouldFollowMessagesRef.current=node.scrollHeight-node.scrollTop-node.clientHeight<80;}}>{threadError&&<div className="messaging-load-error" role="alert">Could not refresh this conversation. Your draft remains here. <button type="button" className="text-button" onClick={()=>void loadMessages(selectedId!)}>Try again</button></div>}{threadLoading&&!messages.length?<div className="people-empty" role="status">Opening conversation…</div>:threadError&&!messages.length?<div className="people-empty">Messages could not be loaded. Try again above.</div>:messages.length?messages.map((message:any)=>{
            const mine=message.senderUserId===viewerId;
            const readByOther=mine&&selected.otherUserId&&(message.readBy??[]).includes(selected.otherUserId);
            return <article className={mine?'direct-message mine':'direct-message'} key={message.id}><div><strong>{mine?'You':selected.otherName}</strong><time>{message.createdAt?new Date(message.createdAt).toLocaleString('en-GB'):''}{mine&&<em className="message-read-state">{readByOther?<><CheckCheck size={11}/> Read{message.readAt?.[selected.otherUserId] ? ' · '+new Date(message.readAt[selected.otherUserId]).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : ''}</>:<><Check size={11}/> Sent</>}</em>}</time></div>{message.collaborationId && <span className="direct-message-context"><Handshake size={10}/>{selected.collaborations?.find((item:any)=>item.id===message.collaborationId)?.title ?? 'Linked collaboration'}</span>}<p>{message.status==='removed_by_admin'?'Message removed by Nightjar moderation.':message.body||'Message unavailable.'}</p>{!mine&&message.status!=='removed_by_admin'&&<button className="text-button" onClick={()=>void report(message)}><Flag size={11}/> Report</button>}</article>;
          }):<div className="people-empty"><MessageCircle size={17}/><strong>Conversation ready.</strong><span>Start with the work, expectations or next step. Protected material should stay in Nightjar’s controlled script tools.</span></div>}</div>
          <div className="message-compose">{blocked&&<div className="messaging-blocked-note"><Ban size={13}/><span>{blockedByMe?'You blocked messages from this account. You can unblock them here when ready.':blockedByOther?'This account is not currently accepting private messages from you. Existing collaboration records remain intact.':'Private messaging is blocked for this conversation.'}</span></div>}<textarea aria-label={'Message to '+String(selected.otherName??'Nightjar member')} value={body} maxLength={4000} disabled={blocked||sending||threadLoading||threadError} onChange={(event)=>{if(selectedId)setDrafts((current)=>({...current,[selectedId]:event.target.value}));}} onKeyDown={(event)=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&!blocked&&!sending){event.preventDefault();void send();}}} placeholder="Write a private message…"/><div><small>{body.length}/4000 · {activeCollaborationId ? 'linked to ' + (selected.collaborations?.find((item:any)=>item.id===activeCollaborationId)?.title ?? 'a Nightjar collaboration') + ' · ' : 'general thread · '}Enter to send · Shift+Enter for a new line · do not paste full protected scripts</small><button className="primary-button" disabled={sending||blocked||threadLoading||threadError||!body.trim()} onClick={()=>void send()}><Send size={13}/>{sending?'Sending…':'Send'}</button></div></div>
        </>:<div className="messaging-thread-empty"><MessageCircle size={22}/><strong>Select a conversation.</strong><span>Messages keep creative communication visible without changing rights, licences or manuscript permissions.</span></div>}
      </div>
    </div>
  </section>;
}
