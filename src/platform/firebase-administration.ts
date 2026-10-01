import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const overviewCall = httpsCallable<void, { people: any }>(functions, 'adminAccountOverview');
const setRoleCall = httpsCallable<{ userId: string; role: 'listener' | 'creator' | 'writer' | 'editor' | 'artist'; status: 'active' | 'pending_review' | 'suspended' }, { userId: string; role: string; status: string }>(functions, 'adminSetAccountRole');
const setClosedBetaTesterCall = httpsCallable<{ email: string; enabled: boolean; note?: string }, { email: string; enabled: boolean; matchedAccounts: number }>(functions, 'adminSetClosedBetaTester');
const setTestAccessCall = httpsCallable<{ userId: string; enabled: boolean }, { userId: string; testAccess: boolean }>(functions, 'adminSetTestAccess');
const professionalBankCall = httpsCallable<void, { applications: any[]; buckets: Record<string, number>; total: number }>(functions, 'listProfessionalApplicationBank');
const reviewProfessionalCall = httpsCallable<{
  userId: string;
  decision: 'banked' | 'approved' | 'rejected' | 'waitlist';
  roles?: ('creator' | 'writer' | 'editor' | 'artist')[];
  wave?: string;
}, {
  userId: string;
  decision: string;
  approvedProfessionalRoles: string[];
  pendingProfessionalRoles: string[];
  activeRole: string;
  applicationStatus: string;
  wave: string | null;
}>(functions, 'reviewProfessionalApplication');

export const nightjarAdministration = {
  async overview() {
    return (await overviewCall()).data;
  },

  async setAccountRole(userId: string, role: 'listener' | 'creator' | 'writer' | 'editor' | 'artist', status: 'active' | 'pending_review' | 'suspended' = 'active') {
    return (await setRoleCall({ userId, role, status })).data;
  },

  async setClosedBetaTester(email: string, enabled: boolean, note = '') {
    return (await setClosedBetaTesterCall({ email: email.trim(), enabled, ...(note ? { note } : {}) })).data;
  },

  async setTestAccess(userId: string, enabled: boolean) {
    return (await setTestAccessCall({ userId, enabled })).data;
  },

  async professionalApplicationBank() {
    return (await professionalBankCall()).data;
  },

  async reviewProfessionalApplication(userId: string, decision: 'banked' | 'approved' | 'rejected' | 'waitlist', roles: ('creator' | 'writer' | 'editor' | 'artist')[] = [], wave = '') {
    return (await reviewProfessionalCall({ userId, decision, ...(roles.length ? { roles } : {}), ...(wave ? { wave } : {}) })).data;
  },

};
