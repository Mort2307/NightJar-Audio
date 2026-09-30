import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Ban, Check, CheckCheck, Flag, Link2, MessageCircle, RefreshCw, Send, ShieldCheck, UserCircle2 } from 'lucide-react';
import { nightjarMessaging } from '../platform/firebase-messaging';

type Props = {
  currentUserId: string;
  notify: (message: string) => void;
  initialTargetUserId?: string | null;
  initialCollaborationId?: string | null;
  onTargetHandled?: () => void;
  demoMode?: boolean;
  simulationMode?: boolean;
};

const roleLabel = (role: string | null | undefined) => role === 'editor' ? 'Audio Editor' : role === 'writer' ? 'Writer' : 'Creator';

export default function ProfessionalInbox({
  currentUserId,
  notify,
  initialTargetUserId = null,
  initialCollaborationId = null,
  onTargetHandled,
  demoMode = false,
  simulationMode = false,
}: Props) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [compose, setCompose] = useState('');
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const active = useMemo(() => conversations.find((item) => item.id === activeId) ?? null, [conversations, activeId]);

  const demoConversations = () => [
    { id:'demo-msg-1', otherUserId:'demo-writer-mara', otherName:'Mara Bell', otherHandle:'marabell', otherRole:'writer', lastMessagePreview:'I have updated the dialogue pass and attached it to our collaboration.', lastMessageAt:new Date(Date.now()-120000).toISOString(), unreadCount:2, collaborationId:'demo-collab-1' },
    { id:'demo-msg-2', otherUserId:'demo-editor-sam', otherName:'Sam Reed', otherHandle:'samreed', otherRole:'editor', lastMessagePreview:'The cleaned mix is ready for your review.', lastMessageAt:new Date(Date.now()-7200000).toISOString(), unreadCount:0, collaborationId:'demo-collab-2' },
  ];

  const loadConversations = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      if (demoMode) {
        setConversations((current) => current.length ? current : demoConversations());
      } else {
        const data = await nightjarMessaging.conversations();
        setConversations(data.conversations ?? []);
      }
    } catch {
      if (!quiet) notify('Inbox could not be loaded.');
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  const openConversation = async (conversationId: string, quiet = false) => {
    setActiveId(conversationId);
    if (!quiet) setThreadLoading(true);
    try {
      if (demoMode) {
        const convo = conversations.find((item) => item.id === conversationId) ?? demoConversations().find((item) => item.id === conversationId);
        setMessages([
          { id:'demo-m-1', senderUserId:convo?.otherUserId, senderName:convo?.otherName, body:'I wanted to keep this conversation beside the work rather than lose it in external messages.', collaborationId:convo?.collaborationId, createdAt:new Date(Date.now()-3600000).toISOString(), readBy:[convo?.otherUserId,currentUserId] },
          { id:'demo-m-2', senderUserId:currentUserId, senderName:'You', body:'Perfect. Keeping the decisions here makes the handoff much clearer.', collaborationId:convo?.collaborationId, createdAt:new Date(Date.now()-3000000).toISOString(), readBy:[currentUserId,convo?.otherUserId] },
          { id:'demo-m-3', senderUserId:convo?.otherUserId, senderName:convo?.otherName, body:convo?.lastMessagePreview ?? 'Latest Nightjar message.', collaborationId:convo?.collaborationId, createdAt:convo?.lastMessageAt, readBy:[convo?.otherUserId,currentUserId] },
        ]);
        setBlocked(false);
        setConversations((items)=>items.map((item)=>item.id===conversationId?{...item,unreadCount:0}:item));
      } else {
        const data = await nightjarMessaging.messages(conversationId);
        setMessages(data.messages ?? []);
        setBlocked(data.blocked === true);
        setConversations((items)=>items.map((item)=>item.id===conversationId?{...item,unreadCount:0}:item));
      }
    } catch {
      if (!quiet) notify('Conversation could not be opened.');
    } finally {
      if (!quiet) setThreadLoading(false);
    }
  };

  useEffect(() => { void loadConversations(); }, [demoMode]);

  useEffect(() => {
    if (!initialTargetUserId) return;
    let cancelled = false;
    void (async () => {
      try {
        if (demoMode) {
          const id='demo-target-'+initialTargetUserId;
          const existing=conversations.find((item)=>item.otherUserId===initialTargetUserId);
          if (existing) {
            await openConversation(existing.id);
          } else {
            const next={ id, otherUserId:initialTargetUserId, otherName:'Nightjar collaborator', otherHandle:null, otherRole:'creator', lastMessagePreview:'', lastMessageAt:new Date().toISOString(), unreadCount:0, collaborationId:initialCollaborationId };
            if (!cancelled) setConversations((items)=>[next,...items]);
            if (!cancelled) setActiveId(id);
            if (!cancelled) setMessages([]);
          }
        } else {
          const result=await nightjarMessaging.start(initialTargetUserId, initialCollaborationId ?? undefined);
          await loadConversations(true);
          if (!cancelled) await openConversation(result.conversationId);
        }
      } catch {
        notify('Conversation could not be started.');
      } finally {
        onTargetHandled?.();
      }
    })();
    return () => { cancelled=true; };
  }, [initialTargetUserId, initialCollaborationId]);

  useEffect(() => {
    const timer=window.setInterval(() => {
      void loadConversations(true);
      if (activeId) void openConversation(activeId,true);
    },15000);
    return () => window.clearInterval(timer);
  }, [activeId, demoMode]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth', block:'end' }); }, [messages.length, activeId]);

  const send = async () => {
    const body=compose.trim();
    if (!body || !activeId || blocked) return;
    setSending(true);
    try {
      if (demoMode) {
        const next={ id:'demo-send-'+Date.now(), senderUserId:currentUserId, senderName:'You', body, collaborationId:active?.collaborationId ?? null, createdAt:new Date().toISOString(), readBy:[currentUserId] };
        setMessages((items)=>[...items,next]);
        setConversations((items)=>items.map((item)=>item.id===activeId?{...item,lastMessagePreview:body,lastMessageAt:next.createdAt,lastSenderUserId:currentUserId}:item));
      } else {
        const result=await nightjarMessaging.send(activeId,body);
        setMessages((items)=>[...items,result.message]);
        await loadConversations(true);
      }
      setCompose('');
    } catch {
      notify('Message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const toggleBlock = async () => {
    if (!active?.otherUserId) return;
    const next=!blocked;
    if (next && !window.confirm('Block private messages from this account? You can unblock them later.')) return;
    try {
      if (!demoMode) await nightjarMessaging.block(active.otherUserId,next);
      setBlocked(next);
      notify(next ? 'Private messages blocked.' : 'Private messages unblocked.');
    } catch {
      notify('Messaging block could not be updated.');
    }
  };

  const report = async (message:any) => {
    if (!activeId || message.senderUserId===currentUserId) return;
    const reason=window.prompt('Why are you reporting this message?') ?? '';
    if (!reason.trim()) return;
    try {
      if (!demoMode) await nightjarMessaging.report(activeId,message.id,reason);
      notify('Message reported for administrator review.');
    } catch {
      notify('Message could not be reported.');
    }
  };

  const unreadTotal=conversations.reduce((sum,item)=>sum+Number(item.unreadCount??0),0);

  return <section className={activeId ? 'professional-inbox thread-open' : 'professional-inbox'}>
    <div className="inbox-sidebar">
      <div className="inbox-sidebar-head">
        <div><span className="mini-label">PRIVATE PROFESSIONAL INBOX</span><h2>Messages</h2><p>Creators, Writers and Audio Editors only.</p></div>
        <button className="icon-button" onClick={()=>void loadConversations()} aria-label="Refresh Inbox"><RefreshCw size={15}/></button>
      </div>
      <div className="inbox-unread-summary"><MessageCircle size={14}/><span><strong>{unreadTotal}</strong> unread message{unreadTotal===1?'':'s'}</span></div>
      <div className="inbox-conversation-list">
        {loading ? <div className="people-empty">Loading Inbox…</div> : conversations.length ? conversations.map((item)=><button className={activeId===item.id?'inbox-conversation active':'inbox-conversation'} key={item.id} onClick={()=>void openConversation(item.id)}>
          <span className="inbox-avatar">{item.otherAvatarUrl?<img src={item.otherAvatarUrl} alt=""/>:<UserCircle2 size={18}/>}</span>
          <span className="inbox-conversation-copy"><strong>{item.otherName}</strong><small>{roleLabel(item.otherRole)}{item.collaborationId?' · linked collaboration':''}</small><em>{item.lastMessagePreview || 'Start the conversation.'}</em></span>
          <span className="inbox-conversation-meta">{item.unreadCount>0&&<b>{item.unreadCount}</b>}<small>{item.lastMessageAt?new Date(item.lastMessageAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}):''}</small></span>
        </button>) : <div className="people-empty"><MessageCircle size={18}/><strong>No private conversations yet.</strong><span>Open a professional profile or collaboration and choose Message.</span></div>}
      </div>
    </div>

    <div className="inbox-thread">
      {!active ? <div className="inbox-thread-empty"><MessageCircle size={28}/><span className="mini-label">NIGHTJAR MESSAGING</span><h2>Keep professional work out of inbox limbo.</h2><p>Use profile and collaboration Message buttons to start a private thread with another Creator, Writer or Audio Editor.</p><div><ShieldCheck size={15}/>Messages can be reported and blocked. Collaboration state remains separate and auditable.</div></div> : <>
        <header className="inbox-thread-head">
          <button className="icon-button inbox-back" onClick={()=>setActiveId(null)} aria-label="Back to conversations"><ArrowLeft size={17}/></button>
          <span className="inbox-avatar">{active.otherAvatarUrl?<img src={active.otherAvatarUrl} alt=""/>:<UserCircle2 size={18}/>}</span>
          <div><strong>{active.otherName}</strong><span>{roleLabel(active.otherRole)}{active.otherHandle?' · @'+String(active.otherHandle).replace(/^@/,''):''}</span></div>
          {active.collaborationId&&<span className="inbox-context-chip"><Link2 size={11}/> Collaboration linked</span>}
          <button className={blocked?'secondary-button':'ghost-button'} onClick={()=>void toggleBlock()}><Ban size={13}/>{blocked?'Unblock':'Block'}</button>
        </header>

        <div className="inbox-message-list">
          {threadLoading ? <div className="people-empty">Loading conversation…</div> : messages.map((message)=>{
            const mine=message.senderUserId===currentUserId;
            const otherRead=mine && active.otherUserId && (message.readBy??[]).includes(active.otherUserId);
            return <article className={mine?'inbox-message mine':'inbox-message'} key={message.id}>
              <div><p>{message.status==='removed_by_admin'?'Message removed by Nightjar moderation.':message.body}</p><span>{message.createdAt?new Date(message.createdAt).toLocaleString('en-GB'):'Sending…'}{mine&&<em>{otherRead?<><CheckCheck size={11}/> Read</>:<><Check size={11}/> Sent</>}</em>}</span></div>
              {!mine&&message.status!=='removed_by_admin'&&<button className="icon-button" onClick={()=>void report(message)} aria-label="Report message"><Flag size={12}/></button>}
            </article>;
          })}
          <div ref={endRef}/>
        </div>

        <div className="inbox-compose">
          {blocked&&<div className="inbox-blocked-note"><Ban size={14}/>Messaging is blocked in this conversation. Unblock to send again.</div>}
          <textarea value={compose} disabled={blocked||sending} maxLength={4000} onChange={(event)=>setCompose(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send();}}} placeholder={blocked?'Messaging blocked':'Write a private professional message…'}/>
          <div><small>{compose.length}/4000 · Enter sends · Shift+Enter adds a line</small><button className="primary-button" disabled={blocked||sending||!compose.trim()} onClick={()=>void send()}>{sending?'Sending…':<>Send <Send size={14}/></>}</button></div>
        </div>
      </>}
    </div>
  </section>;
}
