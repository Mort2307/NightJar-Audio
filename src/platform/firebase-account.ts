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
  suspensionReason?: string | null;
  suspensionCaseId?: string | null;
};

export type ClosedBetaRegistrationStatus = {
  closedBeta: boolean;
  allowed: boolean;
  temporaryAgeBypass: boolean;
};

const registrationStatusCall = httpsCallable<{ email: string }, ClosedBetaRegistrationStatus>(functions, 'closedBetaRegistrationStatus');
const identityCall = httpsCallable<void, NightjarAccountIdentity>(functions, 'accountIdentity');
const memberAccessStatusCall = httpsCallable<void,{status:string;suspensionReason?:string|null;suspensionCaseId?:string|null}>(functions,'memberAccessStatus');
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
export type NightjarApplicationDraft = {
  selectedRoles:NightjarProfessionalRole[];
  statement:string;experience:string;portfolioUrl:string;socialUrl:string;
};
const getApplicationDraftCall=httpsCallable<void,{draft:NightjarApplicationDraft|null;revision:number}>(functions,'getMyProfessionalApplicationDraft');
const saveApplicationDraftCall=httpsCallable<{draft:NightjarApplicationDraft;revision:number},{revision:number}>(functions,'saveMyProfessionalApplicationDraft');
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

const stageRoleCall = httpsCallable<{ role?: 'creator' | 'listener' | 'writer' | 'editor' | 'artist'; roles?: ('creator' | 'listener' | 'writer' | 'editor' | 'artist')[]; referralCode?: string; legalAcceptances?: Array<{ id: string; version: string; accepted: true }> }, { role: 'creator' | 'listener' | 'writer' | 'editor' | 'artist'; roles: ('creator' | 'listener' | 'writer' | 'editor' | 'artist')[]; professionalRoles: NightjarProfessionalRole[]; staged: boolean }>(functions, 'stageRegistrationIntent');

export const nightjarAccount = {
  async registrationAccess(email: string) {
    return (await registrationStatusCall({ email: email.trim() })).data;
  },

  async identity() {
    const result = await identityCall();
    return result.data;
  },

  async accessStatus() {
    return (await memberAccessStatusCall()).data;
  },

  async stageRegistration(
    roleOrRoles: 'creator' | 'listener' | 'writer' | 'editor' | 'artist' | ('creator' | 'listener' | 'writer' | 'editor' | 'artist')[],
    referralCode = '',
    legalAcceptances: Array<{ id: string; version: string; accepted: true }> = [],
  ) {
    const roles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
    const result = await stageRoleCall({ roles, legalAcceptances, ...(referralCode ? { referralCode } : {}) });
    return result.data;
  },

  async professionalRoles() {
    return (await professionalRolesCall()).data;
  },

  async getApplicationDraft() {
    return (await getApplicationDraftCall()).data;
  },

  async saveApplicationDraft(draft:NightjarApplicationDraft,revision:number) {
    return (await saveApplicationDraftCall({draft,revision})).data;
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
