import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type NightjarAccountIdentity = {
  userId: string;
  email: string;
  admin: boolean;
  role: 'admin' | 'creator' | 'listener' | 'writer' | 'editor' | null;
  status: string;
  emailVerified: boolean;
};

const identityCall = httpsCallable<void, NightjarAccountIdentity>(functions, 'accountIdentity');
const roleCall = httpsCallable<{ role: 'creator' | 'listener' | 'writer' }, { userId: string; role: 'creator' | 'listener' | 'writer'; status: string }>(functions, 'chooseAccountRole');

export const nightjarAccount = {
  async identity() {
    const result = await identityCall();
    return result.data;
  },

  async chooseRole(role: 'creator' | 'listener' | 'writer') {
    const result = await roleCall({ role });
    return result.data;
  },
};
