import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const listCall = httpsCallable<void, { conversations:any[]; unreadCount:number }>(functions, 'listProfessionalConversations');
const startCall = httpsCallable<{ recipientUserId:string; message?:string; collaborationId?:string|null }, { conversation:any }>(functions, 'startProfessionalConversation');
const openCall = httpsCallable<{ conversationId:string }, { conversation:any; messages:any[]; blocked:boolean; blockedByMe?:boolean; blockedByOther?:boolean }>(functions, 'openProfessionalConversation');
const sendCall = httpsCallable<{ conversationId:string; body:string; collaborationId?:string|null }, { message:any }>(functions, 'sendProfessionalMessage');
const blockCall = httpsCallable<{ targetUserId:string; blocked:boolean }, { targetUserId:string; blocked:boolean }>(functions, 'setProfessionalMessageBlock');
const reportCall = httpsCallable<{ conversationId:string; messageId:string; reason?:string }, { reported:boolean }>(functions, 'reportProfessionalMessage');
const adminReportsCall = httpsCallable<void, { reports:any[] }>(functions, 'adminListProfessionalMessageReports');
const adminResolveCall = httpsCallable<{ reportId:string; decision:'dismissed'|'actioned'|'removed' }, { reportId:string; status:string }>(functions, 'adminResolveProfessionalMessageReport');

const normaliseConversation = (item:any) => ({
  ...item,
  lastMessage:item.lastMessage ?? '',
  lastMessagePreview:item.lastMessage ?? '',
  collaborationIds:Array.isArray(item.collaborationIds) ? item.collaborationIds : [],
  collaborationId:Array.isArray(item.collaborationIds) && item.collaborationIds.length ? item.collaborationIds[item.collaborationIds.length - 1] : null,
});

export const nightjarMessaging = {
  async conversations() {
    const data=(await listCall()).data;
    return {
      conversations:(data.conversations ?? []).map(normaliseConversation),
      unreadCount:Number(data.unreadCount ?? 0),
    };
  },

  async start(recipientUserId:string, message='', collaborationId?:string|null) {
    const data=(await startCall({
      recipientUserId,
      ...(message ? { message } : {}),
      ...(collaborationId ? { collaborationId } : {}),
    })).data;
    return { conversation:normaliseConversation(data.conversation) };
  },

  async open(conversationId:string) {
    const data=(await openCall({ conversationId })).data;
    return {
      ...data,
      conversation:normaliseConversation(data.conversation ?? { id:conversationId }),
    };
  },

  async send(conversationId:string, body:string, collaborationId?:string|null) {
    return (await sendCall({
      conversationId,
      body,
      ...(collaborationId ? { collaborationId } : {}),
    })).data;
  },

  async setBlocked(targetUserId:string, blocked:boolean) {
    return (await blockCall({ targetUserId, blocked })).data;
  },

  async report(conversationId:string, messageId:string, reason='') {
    return (await reportCall({ conversationId, messageId, reason })).data;
  }
};
