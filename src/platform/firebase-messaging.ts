import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const listCall = httpsCallable<void, { conversations:any[]; unreadCount:number }>(functions, 'listMessageConversations');
const startCall = httpsCallable<{ targetUserId:string; collaborationId?:string|null }, { conversationId:string }>(functions, 'startDirectConversation');
const openCall = httpsCallable<{ conversationId:string }, { messages:any[]; blocked:boolean; blockedByMe?:boolean; blockedByOther?:boolean }>(functions, 'listDirectMessages');
const sendCall = httpsCallable<{ conversationId:string; body:string }, { message:any }>(functions, 'sendDirectMessage');
const blockCall = httpsCallable<{ targetUserId:string; blocked:boolean }, { targetUserId:string; blocked:boolean }>(functions, 'setDirectMessageBlock');
const reportCall = httpsCallable<{ conversationId:string; messageId:string; reason?:string }, { reported:boolean; reportId?:string }>(functions, 'reportDirectMessage');
const adminReportsCall = httpsCallable<void, { reports:any[] }>(functions, 'adminListCommunityReports');
const adminResolveCall = httpsCallable<{ reportId:string; decision:'dismiss'|'remove' }, { reportId:string; decision:string }>(functions, 'adminResolveCommunityReport');

const normaliseConversation = (item:any) => ({
  ...item,
  lastMessage:item.lastMessage ?? item.lastMessagePreview ?? '',
  collaborationIds:item.collaborationIds ?? (item.collaborationId ? [item.collaborationId] : []),
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
    const [thread,list]=await Promise.all([
      openCall({ conversationId }),
      listCall(),
    ]);
    const conversation=(list.data.conversations ?? []).find((item:any)=>item.id===conversationId);
    return {
      ...thread.data,
      conversation:conversation ? normaliseConversation(conversation) : { id:conversationId },
    };
  },

  async send(conversationId:string, body:string, _collaborationId?:string|null) {
    return (await sendCall({ conversationId, body })).data;
  },

  async setBlocked(targetUserId:string, blocked:boolean) {
    return (await blockCall({ targetUserId, blocked })).data;
  },

  async report(conversationId:string, messageId:string, reason='') {
    return (await reportCall({ conversationId, messageId, reason })).data;
  },

  async adminReports() {
    const data=(await adminReportsCall()).data;
    return { reports:(data.reports ?? []).filter((item:any)=>item.type === 'direct_message') };
  },

  async adminResolve(reportId:string, decision:'dismissed'|'removed') {
    return (await adminResolveCall({ reportId, decision:decision === 'removed' ? 'remove' : 'dismiss' })).data;
  },
};
