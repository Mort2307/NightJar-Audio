import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type NightjarAccountIdentity = {
  userId: string;
  email: string;
  admin: boolean;
  role: 'admin' | 'creator' | 'listener' | 'writer' | 'editor' | 'artist' | null;
  status: string;
  emailVerified: boolean;
};

const identityCall = httpsCallable<void, NightjarAccountIdentity>(functions, 'accountIdentity');
const roleCall = httpsCallable<{ role: 'creator' | 'listener' | 'writer' | 'editor' | 'artist'; referralCode?: string }, { userId: string; role: 'creator' | 'listener' | 'writer' | 'editor' | 'artist'; requestedProfessionalRole?: 'creator' | 'writer' | 'editor' | 'artist' | null; status: string }>(functions, 'chooseAccountRole');

export type NightjarProfessionalRole = 'creator' | 'writer' | 'editor' | 'artist';

export type ProfessionalRoleState = {
  listener: true;
  approvedProfessionalRoles: NightjarProfessionalRole[];
  pendingProfessionalRoles: NightjarProfessionalRole[];
  activeRole: 'listener' | NightjarProfessionalRole | 'admin';
  applicationStatus: string | null;
  wave?: string | null;
};

const professionalRolesCall = httpsCallable<void, ProfessionalRoleState>(functions, 'myProfessionalRoles');
const submitProfessionalApplicationCall = httpsCallable<{
  roles: NightjarProfessionalRole[];
  statement?: string;
  experience?: string;
  portfolioUrl?: string;
  socialUrl?: string;
  note?: string;
}, {
  status: string;
  requestedRoles: NightjarProfessionalRole[];
  approvedProfessionalRoles: NightjarProfessionalRole[];
  message: string;
}>(functions, 'submitProfessionalApplication');
const removeProfessionalRoleCall = httpsCallable<{ role: NightjarProfessionalRole }, {
  removedRole: NightjarProfessionalRole;
  approvedProfessionalRoles: NightjarProfessionalRole[];
  pendingProfessionalRoles: NightjarProfessionalRole[];
  activeRole: string;
}>(functions, 'removeProfessionalRole');
const setActiveRoleCall = httpsCallable<{ role: 'listener' | NightjarProfessionalRole }, {
  activeRole: string;
  approvedProfessionalRoles: NightjarProfessionalRole[];
}>(functions, 'setActiveNightjarRole');

const stageRoleCall = httpsCallable<{ role?: 'creator' | 'listener' | 'writer' | 'editor' | 'artist'; roles?: ('creator' | 'listener' | 'writer' | 'editor' | 'artist')[]; referralCode?: string }, { role: 'creator' | 'listener' | 'writer' | 'editor' | 'artist'; roles: ('creator' | 'listener' | 'writer' | 'editor' | 'artist')[]; professionalRoles: NightjarProfessionalRole[]; staged: boolean }>(functions, 'stageRegistrationIntent');

export const nightjarAccount = {
  async identity() {
    const result = await identityCall();
    return result.data;
  },

  async stageRegistration(roleOrRoles: 'creator' | 'listener' | 'writer' | 'editor' | 'artist' | ('creator' | 'listener' | 'writer' | 'editor' | 'artist')[], referralCode = '') {
    const roles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
    const result = await stageRoleCall({ roles, ...(referralCode ? { referralCode } : {}) });
    return result.data;
  },

  async professionalRoles() {
    return (await professionalRolesCall()).data;
  },

  async applyForProfessionalRoles(roles: NightjarProfessionalRole[], details: { statement?: string; experience?: string; portfolioUrl?: string; socialUrl?: string; note?: string } = {}) {
    return (await submitProfessionalApplicationCall({ roles, ...details })).data;
  },

  async removeProfessionalRole(role: NightjarProfessionalRole) {
    return (await removeProfessionalRoleCall({ role })).data;
  },

  async setActiveRole(role: 'listener' | NightjarProfessionalRole) {
    return (await setActiveRoleCall({ role })).data;
  },

  async chooseRole(role: 'creator' | 'listener' | 'writer' | 'editor' | 'artist', referralCode = '') {
    const result = await roleCall({ role, ...(referralCode ? { referralCode } : {}) });
    return result.data;
  },
};
