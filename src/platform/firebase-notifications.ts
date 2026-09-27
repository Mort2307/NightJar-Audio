import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const listCall = httpsCallable<void, { notifications: any[]; unreadCount: number }>(functions, 'listNotifications');
const readCall = httpsCallable<{ notificationId: string }, { read: boolean }>(functions, 'markNotificationRead');

export const nightjarNotifications = {
  async list() {
    return (await listCall()).data;
  },

  async markRead(notificationId: string) {
    return (await readCall({ notificationId })).data;
  },
};
