import { useEffect, useMemo, useState } from 'react';
import { Flag, MessageCircle, RefreshCw, Search, Send, ShieldCheck } from 'lucide-react';
import { nightjarMessaging } from '../platform/firebase-messaging';
import { nightjarCommunity } from '../platform/firebase-community';

type Role='creator'|'writer'|'editor';

type Props={
  role:Role;
  currentUserId?:string|null;
  initialRecipientUserId?:string|null;
  onRecipientHandled?:()=>void;
  notify:(message:string)=>void;
  demoMode?:boolean;
  simulationMode?:boolean;
};

const roleLabel=(role:string)=>role==='editor'?'Audio Editor':role.charAt(0).toUpperCase()+role.slice(1);

export default function MessagingHub({role,currentUserId,initialRecipientUserId,onRecipientHandled,notify,demoMode=false,simulationMode=false}:Props){
  const [conversations,setConversations]=useState<any[]>([]);
  const [directory,setDirectory]=useState<any[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [messages,setMessages]=useState<any[]>([]);
  const [query,setQuery]=useState('');
  const [body,setBody]=useState('');
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);

  const loadConversations=async(silent=false)=>{
    if(!silent) setLoading(true);
    try{
      if(demoMode){
        setConversations([
          {id:'demo-conversation-1',otherUserId:'demo-writer-mara',otherName:'Mara Bell',otherHandle:'marabell',lastMessagePreview:'I have updated the rights note — happy to talk through the changes.',lastMessageAt:new Date(Date.now()-1200000).toISOString(),unreadCount:1},
          {id:'demo-conversation-2',otherUserId:'demo-editor-sam',otherName:'Sam Reed',otherHandle:'samreed',lastMessagePreview:'The dialogue edit is ready for your review.',lastMessageAt:new Date(Date.now()-7200000).toISOString(),unreadCount:0},
        ]);
      }else{
        const data=await nightjarMessaging.conversations();
        setConversations(data.conversations??[]);
      }
    }catch{if(!silent) notify('Messages could not be loaded.');}
    finally{if(!silent)setLoading(false);}
  };

  const loadDirectory=async()=>{
    try{
      if(demoMode){
        setDirectory([
          {userId:'demo-writer-mara',role:'writer',name:'Mara Bell',handle:'marabell',headline:'Dialogue-first Writer'},
          {userId:'demo-creator-noah',role:'creator',name:'Noah Vale',handle:'noahvale',headline:'Character-led Creator'},
          {userId:'demo-editor-sam',role:'editor',name:'Sam Reed',handle:'samreed',headline:'Dialogue editing and production polish'},
        ].filter((item)=>item.role!==role||item.userId!==currentUserId));
      }else{
        const data=await nightjarCommunity.listPublicProfiles();
        setDirectory((data.profiles??[]).filter((item:any)=>['creator','writer','editor'].includes(String(item.role))&&item.userId!==currentUserId).map((item:any)=>({...item,name:item.displayName??item.name??'Nightjar collaborator'})));
      }
    }catch{/* conversation list still works */}
  };

  const loadMessages=async(conversationId:string)=>{
    try{
      if(demoMode){
        setMessages([
          {id:'demo-message-1',conversationId,senderUserId:'demo-writer-mara',senderName:'Mara Bell',body:'I wanted to keep this conversation attached to Nightjar so the collaboration does not disappear into another inbox.',createdAt:new Date(Date.now()-3600000).toISOString(),status:'visible'},
          {id:'demo-message-2',conversationId,senderUserId:currentUserId??'demo-self',senderName:'You',body:'Perfect. I can see the proposal state and message history together now.',createdAt:new Date(Date.now()-3000000).toISOString(),status:'visible'},
        ]);
        setConversations((items)=>items.map((item)=>item.id===conversationId?{...item,unreadCount:0}:item));
      }else{
        const data=await nightjarMessaging.messages(conversationId);
        setMessages(data.messages??[]);
        await loadConversations(true);
      }
    }catch{notify('Conversation could not be loaded.');}
  };

  const startWith=async(targetUserId:string)=>{
    try{
      if(demoMode){
        const existing=conversations.find((item)=>item.otherUserId===targetUserId);
        const person=directory.find((item)=>item.userId===targetUserId);
        const id=existing?.id??'demo-conversation-'+targetUserId;
        if(!existing)setConversations((items)=>[{id,otherUserId:targetUserId,otherName:person?.name??'Demo collaborator',otherHandle:person?.handle??null,lastMessagePreview:'',lastMessageAt:null,unreadCount:0},...items]);
        setSelectedId(id);
        await loadMessages(id);
      }else{
        const data=await nightjarMessaging.start(targetUserId);
        setSelectedId(data.conversationId);
        await Promise.all([loadConversations(true),loadMessages(data.conversationId)]);
      }
      onRecipientHandled?.();
    }catch{notify('Conversation could not be opened.');}
  };

  useEffect(()=>{void loadConversations();void loadDirectory();},[role,demoMode]);
  useEffect(()=>{
    if(initialRecipientUserId) void startWith(initialRecipientUserId);
  },[initialRecipientUserId]);
  useEffect(()=>{
    if(!selectedId)return;
    void loadMessages(selectedId);
    if(demoMode)return;
    const timer=window.setInterval(()=>void loadMessages(selectedId),20000);
    return()=>window.clearInterval(timer);
  },[selectedId,demoMode]);

  const filteredPeople=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    return directory.filter((person:any)=>{
      if(!needle)return true;
      return [person.name,person.handle,person.headline,person.role,...(person.roleSpecialties??[]),...(person.favouriteTags??[])].filter(Boolean).join(' ').toLowerCase().includes(needle);
    }).slice(0,30);
  },[directory,query]);

  const send=async()=>{
    const text=body.trim();
    if(!selectedId||!text)return;
    setSending(true);
    try{
      if(demoMode){
        if(!simulationMode)return notify('Start a creative-role Simulation to send demo messages.');
        const message={id:'demo-message-'+Date.now(),conversationId:selectedId,senderUserId:currentUserId??'demo-self',senderName:'You',body:text,status:'visible',createdAt:new Date().toISOString()};
        setMessages((items)=>[...items,message]);
        setConversations((items)=>items.map((item)=>item.id===selectedId?{...item,lastMessagePreview:text,lastMessageAt:message.createdAt}:item));
      }else{
        const result=await nightjarMessaging.send(selectedId,text);
        setMessages((items)=>[...items,result.message]);
        await loadConversations(true);
      }
      setBody('');
    }catch(error){
      const message=error instanceof Error?error.message:'';
      notify(message.includes('slow down')?'Please slow down before sending more messages.':'Message could not be sent.');
    }finally{setSending(false);}
  };

  const report=async(message:any)=>{
    const reason=window.prompt('What should Nightjar moderation review about this message?')?.trim();
    if(reason==null)return;
    try{
      if(!demoMode&&selectedId)await nightjarMessaging.report(selectedId,message.id,reason);
      notify('Message reported. Only the reported message is supplied to Administrator moderation.');
    }catch{notify('Message could not be reported.');}
  };

  const selected=conversations.find((item)=>item.id===selectedId)??null;

  return <section className="messaging-hub">
    <div className="messaging-hub-head">
      <div><span className="mini-label">PRIVATE CREATIVE MESSAGING</span><h2>Keep the conversation with the work.</h2><p>Creators, Writers and Audio Editors can message each other without moving important collaboration context into external inboxes.</p></div>
      <button className="secondary-button" onClick={()=>void loadConversations()}><RefreshCw size={13}/> Refresh</button>
    </div>
    <div className="messaging-safety-note"><ShieldCheck size={16}/><div><strong>A message is not a manuscript permission.</strong><span>Sending text here never grants script access, copy permission or export rights. Protected manuscripts remain controlled by the Writer permission system.</span></div></div>

    <div className="messaging-layout">
      <aside className="messaging-sidebar">
        <label className="messaging-search"><Search size={14}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Find a creative collaborator…"/></label>
        {!!query.trim()&&<div className="messaging-directory">{filteredPeople.map((person:any)=><button key={person.userId} onClick={()=>void startWith(person.userId)}><span>{String(person.name??'NJ').split(' ').map((part:string)=>part[0]).join('').slice(0,2)}</span><div><strong>{person.name}</strong><small>{roleLabel(person.role)}{person.handle?' · @'+String(person.handle).replace(/^@/,''):''}</small></div></button>)}{!filteredPeople.length&&<div className="people-empty">No matching creative accounts.</div>}</div>}
        <div className="messaging-conversations">
          <span className="mini-label">CONVERSATIONS</span>
          {loading?<div className="people-empty">Loading messages…</div>:conversations.length?conversations.map((conversation:any)=><button className={selectedId===conversation.id?'active':''} key={conversation.id} onClick={()=>setSelectedId(conversation.id)}><span className="messaging-avatar">{String(conversation.otherName??'NJ').split(' ').map((part:string)=>part[0]).join('').slice(0,2)}</span><div><strong>{conversation.otherName}</strong><small>{conversation.lastMessagePreview||'Conversation ready'}</small></div>{conversation.unreadCount>0&&<em>{conversation.unreadCount}</em>}</button>):<div className="people-empty"><MessageCircle size={16}/><strong>No conversations yet.</strong><span>Search for a Creator, Writer or Audio Editor to start one.</span></div>}
        </div>
      </aside>

      <div className="messaging-thread">
        {selected?<><header><div><span className="mini-label">PRIVATE THREAD</span><h3>{selected.otherName}</h3><p>{selected.otherHandle?'@'+String(selected.otherHandle).replace(/^@/,''):'Nightjar creative account'}</p></div></header>
          <div className="message-list">{messages.length?messages.map((message:any)=>{
            const mine=message.senderUserId===currentUserId||(demoMode&&message.senderName==='You');
            return <article className={mine?'direct-message mine':'direct-message'} key={message.id}><div><strong>{mine?'You':message.senderName}</strong><time>{message.createdAt?new Date(message.createdAt).toLocaleString('en-GB'):''}</time></div><p>{message.status==='removed_by_admin'?'Message removed by Nightjar moderation.':message.body}</p>{!mine&&message.status!=='removed_by_admin'&&<button className="text-button" onClick={()=>void report(message)}><Flag size={11}/> Report</button>}</article>;
          }):<div className="people-empty"><MessageCircle size={17}/><strong>Conversation ready.</strong><span>Start with the work, expectations or next step. Protected material should stay in Nightjar’s controlled script tools.</span></div>}</div>
          <div className="message-compose"><textarea value={body} maxLength={4000} onChange={(event)=>setBody(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send();}}} placeholder="Write a private message…"/><div><small>{body.length}/4000 · Enter to send · Shift+Enter for a new line</small><button className="primary-button" disabled={sending||!body.trim()} onClick={()=>void send()}><Send size={13}/>{sending?'Sending…':'Send'}</button></div></div>
        </>:<div className="messaging-thread-empty"><MessageCircle size={22}/><strong>Select a conversation.</strong><span>Messages keep creative communication visible without changing rights, licences or manuscript permissions.</span></div>}
      </div>
    </div>
  </section>;
}
