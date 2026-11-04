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

export type NightjarProfileType = 'listener' | NightjarProfessionalRole;
export type NightjarProfileVisibility = 'public' | 'private' | 'unlisted';
export type NightjarProfileTypeSetting = {
  type: NightjarProfileType;
  enabled: boolean;
  visibility: NightjarProfileVisibility;
  schemaVersion: 1;
};
export type NightjarProfileTypeSettings = Partial<Record<NightjarProfileType, NightjarProfileTypeSetting>>;
export type NightjarProfileTypeSettingsResult = {
  revision: number;
  settings: NightjarProfileTypeSettings;
};
const getProfileTypeSettingsCall = httpsCallable<void, NightjarProfileTypeSettingsResult>(functions, 'getMyProfileTypeSettings');
const saveProfileTypeSettingsCall = httpsCallable<{ expectedRevision: number; settings: NightjarProfileTypeSettings }, ({ saved: true; revision: number; settings: NightjarProfileTypeSettings } | { saved: false; revision: number; settings: NightjarProfileTypeSettings })>(functions, 'saveMyProfileTypeSettings');

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


export type NightjarCommitmentRole = NightjarProfessionalRole;
export type NightjarCommitmentTaskState = 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected' | 'excused' | 'cancelled';
export type NightjarCommitmentTask = {
  id: string; title: string; description?: string; mandatory: boolean; dueDay?: number | null;
  state: NightjarCommitmentTaskState; evidenceIds?: string[]; reviewReason?: string | null;
};
export type NightjarCommitmentAssignment = {
  id: string; periodId: string; role: NightjarCommitmentRole; templateVersion: number;
  status: string; tasks: NightjarCommitmentTask[]; periodStatus: string; startDate: string | null; endDate: string | null;
};
const getMyCommitmentsCall = httpsCallable<void, { assignments: NightjarCommitmentAssignment[] }>(functions, 'getMyCommitments');
const getMyCommitmentEligibilityCall = httpsCallable<{ periodId?: string }, {
  periodId: string | null; approvedRoles: NightjarCommitmentRole[];
  roleResults: Array<{ role: NightjarCommitmentRole; assigned: boolean; applicableMandatoryCount: number; completedMandatoryCount: number; completionPercent: number | null; qualifies: boolean; state: string }>;
  eligible: boolean; qualifyingRole: NightjarCommitmentRole | null;
}>(functions, 'getMyCommitmentEligibility');
const submitCommitmentEvidenceCall = httpsCallable<{ assignmentId: string; taskId: string; note?: string; evidenceUrl?: string }, { submitted: boolean; evidenceId: string; taskState: string }>(functions, 'submitCommitmentEvidence');
const adminCreateCommitmentTemplateCall = httpsCallable<{ role: NightjarCommitmentRole; effectiveFrom: string; tasks: Array<{ id: string; title: string; description?: string; mandatory: boolean; dueDay?: number | null }> }, { templateId: string; role: NightjarCommitmentRole; version: number; effectiveFrom: string }>(functions, 'adminCreateCommitmentTemplate');
const adminCreateCommitmentPeriodCall = httpsCallable<{ periodId: string; startDate: string; endDate: string }, { created: boolean; periodId: string; startDate: string; endDate: string; status: string }>(functions, 'adminCreateCommitmentPeriod');
const adminAssignCommitmentTemplateCall = httpsCallable<{ periodId: string; userId: string; role: NightjarCommitmentRole; templateId: string }, { assigned: boolean; assignmentId: string; periodId: string; role: NightjarCommitmentRole; taskCount: number }>(functions, 'adminAssignCommitmentTemplate');
const adminReviewCommitmentTaskCall = httpsCallable<{ assignmentId: string; taskId: string; decision: 'approved' | 'rejected' | 'cancelled' | 'excused'; reason?: string }, { reviewed: boolean; taskId: string; state: string }>(functions, 'adminReviewCommitmentTask');
const adminSetCommitmentExceptionCall = httpsCallable<{ assignmentId: string; reason: string }, { saved: boolean; assignmentId: string }>(functions, 'adminSetCommitmentException');
const adminListCommitmentReviewQueueCall = httpsCallable<void, { queue: Array<{ assignmentId: string; userId: string; periodId: string; role: NightjarCommitmentRole; pendingTasks: Array<{ id: string; title: string; evidenceIds: string[] }>; evidence: Array<{ taskId: string; evidenceId: string; note: string; evidenceUrl: string | null; submittedAt: string | null }> }> }>(functions, 'adminListCommitmentReviewQueue');
const adminListCommitmentTemplatesCall = httpsCallable<void, { templates: Array<{ id: string; role: NightjarCommitmentRole; version: number; effectiveFrom: string; tasks: NightjarCommitmentTask[]; status: string }> }>(functions, 'adminListCommitmentTemplates');
const adminListCommitmentPeriodsCall = httpsCallable<void, { periods: Array<{ id: string; startDate: string; endDate: string; status: string }> }>(functions, 'adminListCommitmentPeriods');
const adminCloseCommitmentPeriodCall = httpsCallable<{ periodId: string }, { closed: boolean; periodId: string; alreadyClosed: boolean }>(functions, 'adminCloseCommitmentPeriod');
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

  async getMyCommitments() {
    return (await getMyCommitmentsCall()).data;
  },

  async getMyCommitmentEligibility(periodId?: string) {
    return (await getMyCommitmentEligibilityCall(periodId ? { periodId } : {})).data;
  },

  async submitCommitmentEvidence(input: { assignmentId: string; taskId: string; note?: string; evidenceUrl?: string }) {
    return (await submitCommitmentEvidenceCall(input)).data;
  },

  async adminCreateCommitmentTemplate(input: { role: NightjarCommitmentRole; effectiveFrom: string; tasks: Array<{ id: string; title: string; description?: string; mandatory: boolean; dueDay?: number | null }> }) {
    return (await adminCreateCommitmentTemplateCall(input)).data;
  },

  async adminCreateCommitmentPeriod(input: { periodId: string; startDate: string; endDate: string }) {
    return (await adminCreateCommitmentPeriodCall(input)).data;
  },

  async adminAssignCommitmentTemplate(input: { periodId: string; userId: string; role: NightjarCommitmentRole; templateId: string }) {
    return (await adminAssignCommitmentTemplateCall(input)).data;
  },

  async adminReviewCommitmentTask(input: { assignmentId: string; taskId: string; decision: 'approved' | 'rejected' | 'cancelled' | 'excused'; reason?: string }) {
    return (await adminReviewCommitmentTaskCall(input)).data;
  },

  async adminSetCommitmentException(input: { assignmentId: string; reason: string }) {
    return (await adminSetCommitmentExceptionCall(input)).data;
  },

  async adminListCommitmentTemplates() {
    return (await adminListCommitmentTemplatesCall()).data;
  },

  async adminListCommitmentPeriods() {
    return (await adminListCommitmentPeriodsCall()).data;
  },

  async adminCloseCommitmentPeriod(periodId: string) {
    return (await adminCloseCommitmentPeriodCall({ periodId })).data;
  },

  async adminListCommitmentReviewQueue() {
    return (await adminListCommitmentReviewQueueCall()).data;
  },

  async getProfileTypeSettings() {
    return (await getProfileTypeSettingsCall()).data;
  },

  async saveProfileTypeSettings(settings: NightjarProfileTypeSettings, expectedRevision: number) {
    return (await saveProfileTypeSettingsCall({ settings, expectedRevision })).data;
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
