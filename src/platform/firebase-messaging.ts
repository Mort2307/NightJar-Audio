import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const listCall = httpsCallable<void, { conversations:any[]; unreadCount:number }>(functions, 'listMessageConversations');
const startCall = httpsCallable<{ targetUserId:string; collaborationId?:string }, { conversationId:string }>(functions, 'startDirectConversation');
const messagesCall = httpsCallable<{ conversationId:string }, { messages:any[] }>(functions, 'listDirectMessages');
const sendCall = httpsCallable<{ conversationId:string; body:string }, { message:any }>(functions, 'sendDirectMessage');
const reportCall = httpsCallable<{ conversationId:string; messageId:string; reason?:string }, { reported:boolean; reportId:string }>(functions, 'reportDirectMessage');

export const nightjarMessaging = {
  async conversations() {
    return (await listCall()).data;
  },
  async start(targetUserId:string, collaborationId?:string) {
    return (await startCall({ targetUserId, ...(collaborationId ? { collaborationId } : {}) })).data;
  },
  async messages(conversationId:string) {
    return (await messagesCall({ conversationId })).data;
  },
  async send(conversationId:string, body:string) {
    return (await sendCall({ conversationId, body })).data;
  },
  async report(conversationId:string, messageId:string, reason='') {
    return (await reportCall({ conversationId, messageId, reason })).data;
  },
};
