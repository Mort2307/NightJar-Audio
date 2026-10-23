import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const listCall = httpsCallable<void, { conversations:any[]; unreadCount:number }>(functions, 'listMessageConversations');
const startCall = httpsCallable<{ targetUserId:string; collaborationId?:string|null }, { conversationId:string }>(functions, 'startDirectConversation');
const openCall = httpsCallable<{ conversationId:string }, { messages:any[]; blocked:boolean; blockedByMe?:boolean; blockedByOther?:boolean }>(functions, 'listDirectMessages');
const sendCall = httpsCallable<{ conversationId:string; body:string; collaborationId?:string|null }, { message:any }>(functions, 'sendDirectMessage');
const reminderCall = httpsCallable<{ conversationId:string }, { conversationId:string; reminderSent:boolean; reminderForLastMessageAt:string|null }>(functions, 'sendDirectMessageReminder');
const closeLoopCall = httpsCallable<{ conversationId:string }, { conversationId:string; resolved:boolean; resolvedForLastMessageAt:string }>(functions, 'closeDirectConversationLoop');
const blockCall = httpsCallable<{ targetUserId:string; blocked:boolean }, { targetUserId:string; blocked:boolean }>(functions, 'setDirectMessageBlock');
const reportCall = httpsCallable<{ conversationId:string; messageId:string; reason?:string }, { reported:boolean; reportId?:string }>(functions, 'reportDirectMessage');
const adminReportsCall = httpsCallable<void, { reports:any[] }>(functions, 'adminListCommunityReports');
const adminResolveCall = httpsCallable<{ reportId:string; decision:'dismiss'|'remove' }, { reportId:string; decision:string }>(functions, 'adminResolveCommunityReport');

const normaliseConversation = (item:any) => ({
  ...item,
  lastMessage:item.lastMessage ?? item.lastMessagePreview ?? '',
  lastMessagePreview:item.lastMessagePreview ?? item.lastMessage ?? '',
  collaborationIds:Array.isArray(item.collaborationIds) ? item.collaborationIds : (item.collaborationId ? [item.collaborationId] : []),
  collaborationId:item.collaborationId ?? (Array.isArray(item.collaborationIds) && item.collaborationIds.length ? item.collaborationIds[item.collaborationIds.length - 1] : null),
});

export const nightjarMessaging = {
  async conversations() {
    const data=(await listCall()).data;
    return {
      conversations:(data.conversations ?? []).map(normaliseConversation),
      unreadCount:Number(data.unreadCount ?? 0),
    };
  },

  async start(recipientUserId:string, _message='', collaborationId?:string|null) {
    const data=(await startCall({
      targetUserId:recipientUserId,
      ...(collaborationId ? { collaborationId } : {}),
    })).data;
    return { conversation:{ id:data.conversationId } };
  },

  async open(conversationId:string) {
    // Mark/read the opened thread first; fetch unread counts afterwards so the
    // Inbox reflects the read state rather than a parallel pre-open snapshot.
    const thread=await openCall({ conversationId });
    const list=await listCall();
    const conversations=(list.data.conversations ?? []).map(normaliseConversation);
    const raw=conversations.find((item:any)=>item.id===conversationId);
    return {
      ...thread.data,
      conversation:normaliseConversation(raw ?? { id:conversationId }),
      conversations,
      unreadCount:Number(list.data.unreadCount ?? 0),
    };
  },

  async send(conversationId:string, body:string, collaborationId?:string|null) {
    return (await sendCall({ conversationId, body, ...(collaborationId ? { collaborationId } : {}) })).data;
  },

  async remind(conversationId:string) {
    return (await reminderCall({ conversationId })).data;
  },

  async closeLoop(conversationId:string) {
    return (await closeLoopCall({ conversationId })).data;
  },

  async setBlocked(targetUserId:string, blocked:boolean) {
    return (await blockCall({ targetUserId, blocked })).data;
  },

  async report(conversationId:string, messageId:string, reason='') {
    return (await reportCall({ conversationId, messageId, reason })).data;
  },

  async adminReports() {
    const data=(await adminReportsCall()).data;
    return {
      reports:(data.reports ?? [])
        .filter((item:any)=>item.type === 'direct_message')
        .map((item:any)=>({
          ...item,
          type:'professional_message',
          messageBodySnapshot:item.snapshotText ?? '',
        })),
    };
  },

  async adminResolve(reportId:string, decision:'dismissed'|'actioned'|'removed') {
    const mapped:'dismiss'|'remove'=decision === 'dismissed' ? 'dismiss' : 'remove';
    return (await adminResolveCall({ reportId, decision:mapped })).data;
  },
};
