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
const roleCall = httpsCallable<{ role: 'creator' | 'listener' | 'writer' | 'editor'; referralCode?: string }, { userId: string; role: 'creator' | 'listener' | 'writer' | 'editor'; status: string }>(functions, 'chooseAccountRole');
const stageRoleCall = httpsCallable<{ role: 'creator' | 'listener' | 'writer' | 'editor'; referralCode?: string }, { role: 'creator' | 'listener' | 'writer' | 'editor'; staged: boolean }>(functions, 'stageRegistrationIntent');

export const nightjarAccount = {
  async identity() {
    const result = await identityCall();
    return result.data;
  },

  async stageRegistration(role: 'creator' | 'listener' | 'writer' | 'editor', referralCode = '') {
    const result = await stageRoleCall({ role, ...(referralCode ? { referralCode } : {}) });
    return result.data;
  },

  async chooseRole(role: 'creator' | 'listener' | 'writer' | 'editor', referralCode = '') {
    const result = await roleCall({ role, ...(referralCode ? { referralCode } : {}) });
    return result.data;
  },
};
