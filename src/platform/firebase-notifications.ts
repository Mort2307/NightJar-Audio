import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const listCall = httpsCallable<void, { notifications: any[]; unreadCount: number }>(functions, 'listNotifications');
const readCall = httpsCallable<{ notificationId: string }, { read: boolean }>(functions, 'markNotificationRead');
const preferencesCall = httpsCallable<void, { preferences: any }>(functions, 'getNotificationPreferences');
const savePreferencesCall = httpsCallable<Record<string, unknown>, { preferences: any }>(functions, 'saveNotificationPreferences');

export const nightjarNotifications = {
  async list() {
    return (await listCall()).data;
  },

  async markRead(notificationId: string) {
    return (await readCall({ notificationId })).data;
  },

  async preferences() {
    return (await preferencesCall()).data;
  },

  async savePreferences(preferences: Record<string, unknown>) {
    return (await savePreferencesCall(preferences)).data;
  },
};
