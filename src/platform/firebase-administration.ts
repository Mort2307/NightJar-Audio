import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const overviewCall = httpsCallable<void, { people: any }>(functions, 'adminAccountOverview');
const setRoleCall = httpsCallable<{ userId: string; role: 'listener' | 'creator' | 'writer' | 'editor' | 'artist'; status: 'active' | 'pending_review' | 'suspended' }, { userId: string; role: string; status: string }>(functions, 'adminSetAccountRole');
const setTestAccessCall = httpsCallable<{ userId: string; enabled: boolean }, { userId: string; testAccess: boolean }>(functions, 'adminSetTestAccess');
const applicationsCall = httpsCallable<void, { applications: any[] }>(functions, 'listCreatorApplications');

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

const decideCall = httpsCallable<{ applicationId: string; decision: 'approved' | 'waitlist' | 'rejected' }, { applicationId: string; userId: string; decision: string; accountStatus: string }>(functions, 'decideCreatorApplication');

export const nightjarAdministration = {
  async overview() {
    return (await overviewCall()).data;
  },

  async setAccountRole(userId: string, role: 'listener' | 'creator' | 'writer' | 'editor' | 'artist', status: 'active' | 'pending_review' | 'suspended' = 'active') {
    return (await setRoleCall({ userId, role, status })).data;
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

  async creatorApplications() {
    return (await applicationsCall()).data;
  },

  async decideCreatorApplication(applicationId: string, decision: 'approved' | 'waitlist' | 'rejected') {
    return (await decideCall({ applicationId, decision })).data;
  },
};
