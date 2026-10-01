import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, BellRing, Check, CheckCheck, CircleCheckBig, Clock3, Flag, Handshake, MessageCircle, RefreshCw, Search, Send, ShieldCheck } from 'lucide-react';
import { nightjarMessaging } from '../platform/firebase-messaging';
import { nightjarCollaboration } from '../platform/firebase-collaboration';

type Role='creator'|'writer'|'editor';

type Props={
  role:Role;
  currentUserId?:string|null;
  initialRecipientUserId?:string|null;
  initialConversationId?:string|null;
  initialCollaborationId?:string|null;
  onRecipientHandled?:()=>void;
  onUnreadChange?:(count:number)=>void;
  notify:(message:string)=>void;
  demoMode?:boolean;
  simulationMode?:boolean;
};

type MessageTargetEvent=CustomEvent<{userId?:string;collaborationId?:string|null}>;

const roleLabel=(role:string)=>role==='editor'?'Audio Editor':role==='writer'?'Writer':'Creator';

export default function MessagingHub({role,currentUserId,initialRecipientUserId,initialConversationId,initialCollaborationId,onRecipientHandled,onUnreadChange,notify,demoMode=false,simulationMode=false}:Props){
  const [conversations,setConversations]=useState<any[]>([]);
  const [directory,setDirectory]=useState<any[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [messages,setMessages]=useState<any[]>([]);
  const [query,setQuery]=useState('');
  const [body,setBody]=useState('');
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [reminding,setReminding]=useState(false);
  const [blocked,setBlocked]=useState(false);
  const [blockedByMe,setBlockedByMe]=useState(false);
  const [blockedByOther,setBlockedByOther]=useState(false);
  const [activeCollaborationId,setActiveCollaborationId]=useState<string|null>(null);
  const messageListRef=useRef<HTMLDivElement|null>(null);

  const viewerId=demoMode?(currentUserId??'demo-self'):(currentUserId??'');

  const loadConversations=async(silent=false)=>{
    if(!silent)setLoading(true);
    try{
      if(demoMode){
        const demoConversations=[
          {id:'demo-professional-1',otherUserId:'demo-writer-mara',otherName:'Mara Bell',otherHandle:'marabell',otherRole:'writer',lastMessage:'I updated the rights note — happy to talk through the changes.',lastMessageAt:new Date(Date.now()-1200000).toISOString(),lastSenderUserId:'demo-writer-mara',waitingState:'awaiting_me',waitingHours:0,reminderEligible:false,reminderAlreadySent:false,unreadCount:1,collaborationId:'demo-collab-1',collaborationIds:['demo-collab-1','demo-collab-2'],collaborations:[{id:'demo-collab-1',title:'Midnight Call',status:'discussing'},{id:'demo-collab-2',title:'After Hours',status:'accepted'}]},
          {id:'demo-professional-2',otherUserId:'demo-editor-sam',otherName:'Sam Reed',otherHandle:'samreed',otherRole:'editor',lastMessage:'Just checking whether the latest production handoff reached you.',lastMessagePreview:'Just checking whether the latest production handoff reached you.',lastMessageAt:new Date(Date.now()-72*60*60*1000).toISOString(),lastSenderUserId:viewerId,waitingState:'awaiting_them',waitingHours:72,reminderEligible:true,reminderAlreadySent:false,unreadCount:0,collaborationIds:[]},
        ];
        setConversations(demoConversations);
        onUnreadChange?.(demoConversations.reduce((sum,item)=>sum+Number(item.unreadCount??0),0));
      }else{
        const data=await nightjarMessaging.conversations();
        setConversations(data.conversations??[]);
        onUnreadChange?.(Number(data.unreadCount??0));
      }
    }catch{if(!silent)notify('Messages could not be loaded.');}
    finally{if(!silent)setLoading(false);}
  };

  const loadDirectory=async()=>{
    try{
      if(demoMode){
        setDirectory([
          {userId:'demo-writer-mara',role:'writer',name:'Mara Bell',handle:'marabell',headline:'Dialogue-first Writer'},
          {userId:'demo-creator-noah',role:'creator',name:'Noah Vale',handle:'noahvale',headline:'Character-led Creator'},
          {userId:'demo-editor-sam',role:'editor',name:'Sam Reed',handle:'samreed',headline:'Dialogue editing and production polish'},
        ].filter((item)=>item.userId!==currentUserId));
      }else{
        const data=await nightjarCollaboration.directory();
        setDirectory((data.people??[]).filter((item:any)=>['creator','writer','editor'].includes(String(item.role))&&item.userId!==currentUserId));
      }
    }catch{/* existing conversations still work */}
  };

  const loadMessages=async(conversationId:string)=>{
    try{
      if(demoMode){
        const selected=conversations.find((item)=>item.id===conversationId);
        setMessages([
          {id:'demo-message-1',conversationId,senderUserId:selected?.otherUserId??'demo-writer-mara',body:'I wanted to keep this conversation attached to Nightjar so the collaboration does not disappear into another inbox.',readBy:[selected?.otherUserId??'demo-writer-mara',viewerId],createdAt:new Date(Date.now()-3600000).toISOString(),collaborationId:'demo-collab-1'},
          {id:'demo-message-2',conversationId,senderUserId:viewerId,body:'Perfect. I can see the proposal state and message history together now.',readBy:[viewerId,selected?.otherUserId??'demo-writer-mara'],createdAt:new Date(Date.now()-3000000).toISOString(),collaborationId:'demo-collab-1'},
        ]);
        setBlocked(false);
        setBlockedByMe(false);
        setBlockedByOther(false);
        setConversations((items)=>items.map((item)=>item.id===conversationId?{...item,unreadCount:0}:item));
      }else{
        const data=await nightjarMessaging.open(conversationId);
        setMessages(data.messages??[]);
        const activeConversation=data.conversation??{};
        setActiveCollaborationId((current)=>current && (activeConversation.collaborationIds??[]).includes(current) ? current : activeConversation.collaborationId ?? activeConversation.collaborations?.[activeConversation.collaborations.length-1]?.id ?? null);
        setBlocked(data.blocked===true);
        setBlockedByMe(data.blockedByMe===true);
        setBlockedByOther(data.blockedByOther===true);
        setConversations((items)=>items.map((item)=>item.id===conversationId?{...item,...(data.conversation??{}),unreadCount:0}:item));
        await loadConversations(true);
      }
    }catch{notify('Conversation could not be loaded.');}
  };

  const startWith=async(targetUserId:string,collaborationId:string|null=null)=>{
    try{
      setActiveCollaborationId(collaborationId);
      if(demoMode){
        const existing=conversations.find((item)=>item.otherUserId===targetUserId);
        const person=directory.find((item)=>item.userId===targetUserId);
        const id=existing?.id??'demo-professional-'+targetUserId;
        if(!existing)setConversations((items)=>[{id,otherUserId:targetUserId,otherName:person?.name??'Demo collaborator',otherHandle:person?.handle??null,otherRole:person?.role??null,lastMessage:'',lastMessageAt:null,unreadCount:0,collaborationIds:collaborationId?[collaborationId]:[]},...items]);
        setSelectedId(id);
        await loadMessages(id);
      }else{
        const data=await nightjarMessaging.start(targetUserId,'',collaborationId??undefined);
        const id=data.conversation?.id;
        if(!id)throw new Error('Conversation id missing');
        setSelectedId(id);
        await Promise.all([loadConversations(true),loadMessages(id)]);
      }
      onRecipientHandled?.();
    }catch{notify('Conversation could not be opened.');}
  };

  useEffect(()=>{void loadConversations();void loadDirectory();},[role,demoMode]);
  useEffect(()=>{if(initialRecipientUserId)void startWith(initialRecipientUserId,initialCollaborationId??null);},[initialRecipientUserId,initialCollaborationId]);
  useEffect(()=>{
    if(!initialConversationId)return;
    setSelectedId(initialConversationId);
    void loadMessages(initialConversationId).finally(()=>onRecipientHandled?.());
  },[initialConversationId]);

  useEffect(()=>{
    const node=messageListRef.current;
    if(!node)return;
    node.scrollTo({top:node.scrollHeight,behavior:'smooth'});
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
    const timer=window.setInterval(()=>void loadMessages(selectedId),20000);
    return()=>window.clearInterval(timer);
  },[selectedId,demoMode]);

  const selectConversation=(conversation:any)=>{
    setSelectedId(conversation.id);
    const collaborationId=conversation.collaborationId ?? conversation.collaborations?.[conversation.collaborations.length-1]?.id ?? null;
    setActiveCollaborationId(collaborationId);
  };

  const filteredPeople=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    return directory.filter((person:any)=>{
      if(!needle)return true;
      return [person.name,person.handle,person.headline,person.role,...(person.roleSpecialties??[]),...(person.favouriteTags??[])].filter(Boolean).join(' ').toLowerCase().includes(needle);
    }).slice(0,30);
  },[directory,query]);

  const send=async()=>{
    const text=body.trim();
    if(!selectedId||!text||blocked)return;
    setSending(true);
    try{
      if(demoMode){
        if(!simulationMode)return notify('Start a creative-role Simulation to send demo messages.');
        const message={id:'demo-message-'+Date.now(),conversationId:selectedId,senderUserId:viewerId,body:text,createdAt:new Date().toISOString(),collaborationId:activeCollaborationId};
        setMessages((items)=>[...items,message]);
        setConversations((items)=>items.map((item)=>item.id===selectedId?{...item,lastMessage:text,lastMessageAt:message.createdAt}:item));
      }else{
        const result=await nightjarMessaging.send(selectedId,text,activeCollaborationId);
        setMessages((items)=>[...items,result.message]);
        await loadConversations(true);
      }
      setBody('');
    }catch(error){
      const message=error instanceof Error?error.message:'';
      notify(message.includes('blocked')?'Messaging is blocked between these accounts.':message.includes('slow')?'Please slow down before sending more messages.':'Message could not be sent.');
    }finally{setSending(false);}
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

  useEffect(()=>{onUnreadChange?.(unreadTotal);},[unreadTotal]);

  return <section className="messaging-hub" id="nightjar-messaging-hub">
    <div className="messaging-hub-head">
      <div><span className="mini-label">PRIVATE PROFESSIONAL MESSAGING</span><h2>Keep the conversation with the work.</h2><p>Creators, Writers and Audio Editors can message each other directly, with unread state, collaboration context, blocking and reporting built in.</p></div>
      <div className="messaging-head-actions"><span className="status-pill">{unreadTotal} unread</span><button className="secondary-button" onClick={()=>void loadConversations()}><RefreshCw size={13}/> Refresh</button></div>
    </div>
    <div className="messaging-safety-note"><ShieldCheck size={16}/><div><strong>A message is not a manuscript permission.</strong><span>Listeners cannot enter these DMs. Full scripts stay in Protected Reader / controlled sharing. Nightjar keeps reply responsibility visible, lets either professional close a finished loop, and allows only one reminder per unanswered message streak after 48 hours.</span></div></div>

    <div className="messaging-layout">
      <aside className="messaging-sidebar">
        <label className="messaging-search"><Search size={14}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Find Creator, Writer or Audio Editor…"/></label>
        {!!query.trim()&&<div className="messaging-directory">{filteredPeople.map((person:any)=><button key={person.userId} onClick={()=>void startWith(person.userId)}><span>{String(person.name??'NJ').split(' ').map((part:string)=>part[0]).join('').slice(0,2)}</span><div><strong>{person.name}</strong><small>{roleLabel(person.role)}{person.handle?' · @'+String(person.handle).replace(/^@/,''):''}</small></div></button>)}{!filteredPeople.length&&<div className="people-empty">No matching professional accounts.</div>}</div>}
        <div className="messaging-conversations">
          <span className="mini-label">CONVERSATIONS</span>
          {loading?<div className="people-empty">Loading messages…</div>:conversations.length?conversations.map((conversation:any)=><button className={selectedId===conversation.id?'active':''} key={conversation.id} onClick={()=>selectConversation(conversation)}><span className="messaging-avatar">{conversation.otherAvatarUrl?<img className="avatar-approved-image" src={conversation.otherAvatarUrl} alt="" loading="lazy" decoding="async"/>:String(conversation.otherName??'NJ').split(' ').map((part:string)=>part[0]).join('').slice(0,2)}</span><div><strong>{conversation.otherName}</strong><small>{conversation.lastMessagePreview||'Conversation ready'}</small>{needsReply(conversation)?<span className="messaging-needs-reply"><Clock3 size={10}/> Reply needed</span>:awaitingReply(conversation)?<span className={conversation.reminderAlreadySent?'messaging-awaiting-reply reminder-sent':'messaging-awaiting-reply'}><Clock3 size={10}/>{conversation.reminderAlreadySent?'Reminder sent · still awaiting reply':'Awaiting reply · '+waitingHours(conversation)+'h'}</span>:waitingState(conversation)==='awaiting_them'?<span className="messaging-awaiting-reply"><Clock3 size={10}/> Awaiting reply</span>:waitingState(conversation)==='resolved'?<span className="messaging-loop-resolved"><CircleCheckBig size={10}/> Loop closed</span>:null}</div>{conversation.unreadCount>0&&<em>{conversation.unreadCount}</em></button>):<div className="people-empty"><MessageCircle size={16}/><strong>No conversations yet.</strong><span>Search for a Creator, Writer or Audio Editor to start one.</span></div>}
        </div>
      </aside>

      <div className="messaging-thread">
        {selected?<><header><div><span className="mini-label">PRIVATE THREAD</span><h3>{selected.otherName}</h3><p>{selected.otherRole?roleLabel(selected.otherRole)+' · ':''}{selected.otherHandle?'@'+String(selected.otherHandle).replace(/^@/,''):'Nightjar professional account'}{needsReply(selected)?' · your reply is expected':awaitingReply(selected)?' · waiting '+waitingHours(selected)+'h for a reply':waitingState(selected)==='awaiting_them'?' · awaiting their reply':waitingState(selected)==='resolved'?' · loop closed — no reply needed':''}</p></div><div className="messaging-thread-actions">{waitingState(selected)!=='resolved'&&waitingState(selected)!=='none'&&<button className="ghost-button" onClick={()=>void closeLoop()}><CircleCheckBig size={12}/> Close loop</button>}{(selected.reminderEligible===true || (awaitingReply(selected)&&selected.reminderAlreadySent!==true))&&<button className="secondary-button" disabled={reminding||blocked} onClick={()=>void sendReminder()}><BellRing size={12}/>{reminding?'Sending…':'Send one reminder'}</button>}{selected.reminderAlreadySent&&waitingState(selected)!=='resolved'&&<span className="messaging-reminder-sent"><Check size={11}/> Reminder sent</span>}<button className={blockedByMe?'secondary-button':'ghost-button'} onClick={()=>void toggleBlock()}><Ban size={12}/>{blockedByMe?'Unblock':'Block messages'}</button></div></header>
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
          <div className="message-list" ref={messageListRef}>{messages.length?messages.map((message:any)=>{
            const mine=message.senderUserId===viewerId;
            const readByOther=mine&&selected.otherUserId&&(message.readBy??[]).includes(selected.otherUserId);
            return <article className={mine?'direct-message mine':'direct-message'} key={message.id}><div><strong>{mine?'You':selected.otherName}</strong><time>{message.createdAt?new Date(message.createdAt).toLocaleString('en-GB'):''}{mine&&<em className="message-read-state">{readByOther?<><CheckCheck size={11}/> Read</>:<><Check size={11}/> Sent</>}</em>}</time></div>{message.collaborationId && <span className="direct-message-context"><Handshake size={10}/>{selected.collaborations?.find((item:any)=>item.id===message.collaborationId)?.title ?? 'Linked collaboration'}</span>}<p>{message.status==='removed_by_admin'?'Message removed by Nightjar moderation.':message.body||'Message unavailable.'}</p>{!mine&&message.status!=='removed_by_admin'&&<button className="text-button" onClick={()=>void report(message)}><Flag size={11}/> Report</button>}</article>;
          }):<div className="people-empty"><MessageCircle size={17}/><strong>Conversation ready.</strong><span>Start with the work, expectations or next step. Protected material should stay in Nightjar’s controlled script tools.</span></div>}</div>
          <div className="message-compose">{blocked&&<div className="messaging-blocked-note"><Ban size={13}/><span>{blockedByMe?'You blocked messages from this account. You can unblock them here when ready.':blockedByOther?'This account is not currently accepting private messages from you. Existing collaboration records remain intact.':'Private messaging is blocked for this conversation.'}</span></div>}<textarea value={body} maxLength={4000} disabled={blocked} onChange={(event)=>setBody(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter'&&!event.shiftKey&&!blocked){event.preventDefault();void send();}}} placeholder="Write a private message…"/><div><small>{body.length}/4000 · {activeCollaborationId ? 'linked to ' + (selected.collaborations?.find((item:any)=>item.id===activeCollaborationId)?.title ?? 'a Nightjar collaboration') + ' · ' : 'general thread · '}Enter to send · Shift+Enter for a new line · do not paste full protected scripts</small><button className="primary-button" disabled={sending||blocked||!body.trim()} onClick={()=>void send()}><Send size={13}/>{sending?'Sending…':'Send'}</button></div></div>
        </>:<div className="messaging-thread-empty"><MessageCircle size={22}/><strong>Select a conversation.</strong><span>Messages keep creative communication visible without changing rights, licences or manuscript permissions.</span></div>}
      </div>
    </div>
  </section>;
}
