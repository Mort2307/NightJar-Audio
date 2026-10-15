import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type AgeStatus = {
  verified: boolean;
  status: string;
  ageThreshold: number;
  configured: boolean;
  provider: string;
  environment: string;
  verifiedAt: any;
  reverifyRequired: boolean;
  testAvailable: boolean;
  providerVerified?: boolean;
  providerStatus?: string;
  livePilotAvailable?: boolean;
  diditPilotEligible?: boolean;
  sessionActive?: boolean;
  verificationPaused?: boolean;
  controlledAdminTestClaimed?: boolean;
  temporaryBypass?: boolean;
  temporaryBypassReason?: string | null;
};

export type DiditDiagnostics = {
  outcome: 'verified' | 'no_account_session' | 'session_binding_missing' |
    'awaiting_signed_webhook' | 'webhook_waiting_for_processing' |
    'webhook_ignored_or_superseded' | 'adult_evidence_missing' | 'provider_result_not_verified';
  providerVerified: boolean;
  verificationEvidenceSource?: string | null;
  oneShotClaimed: boolean;
  accountProviderStatus: string;
  sessionRecorded: boolean;
  sessionBound: boolean;
  sessionProviderStatus: string | null;
  signedWebhookReceived: boolean;
  webhookProcessed: boolean;
  webhookIgnored: boolean;
  webhookStatus: string | null;
  adultEvidenceConfirmed: boolean;
  lastWebhookReceivedAt: string | null;
  lastWebhookProcessedAt: string | null;
  publicVerificationPaused: boolean;
};

const diagnosticsCall = httpsCallable<void, DiditDiagnostics>(functions, 'adminDiditDiagnostics');
const reconcileCall = httpsCallable<void, { verified: boolean; outcome: 'reconciled' | 'already_verified' | 'provider_not_approved' }>(functions, 'adminReconcileDiditApproval');
const statusCall = httpsCallable<void, AgeStatus>(functions, 'ageStatus');
const startCall = httpsCallable<{ controlledAdminTest?: boolean }, Record<string, unknown>>(functions, 'startAgeAssurance');
const testPassCall = httpsCallable<void, { verified: boolean; status: string; provider: string }>(functions, 'adminAgeTestPass');
export type SingleMemberDiditMaintenanceStatus = {
  eligible: boolean;
  checkAvailable: boolean;
  alreadyClaimed: boolean;
  providerVerified: boolean;
  existingSession: boolean;
  sessionLaunchUrl: string | null;
  reason: 'not_invited' | 'verified' | 'request_not_approved' | 'session_created' | 'one_attempt_claimed' | 'ready' | 'not_ready';
};
export type SingleMemberDiditStart = {
  verified?: boolean; status: string; provider: string; environment?: string;
  sessionId?: string; launchUrl?: string; resumed?: boolean;
};
const maintenanceStatusCall = httpsCallable<void,SingleMemberDiditMaintenanceStatus>(functions,'singleMemberDiditMaintenanceStatus');
const maintenanceStartCall = httpsCallable<{consentsToNewPaidCheck:true},SingleMemberDiditStart>(functions,'startSingleMemberDiditMaintenanceCheck');

export const nightjarAge = {
  async singleMemberMaintenanceStatus() {
    return (await maintenanceStatusCall()).data;
  },
  async startSingleMemberMaintenanceCheck() {
    return (await maintenanceStartCall({consentsToNewPaidCheck:true})).data;
  },
  async status() {
    return (await statusCall()).data;
  },

  // Administrative diagnostics are read-only: never open a provider session.
  async adminDiagnostics() {
    return (await diagnosticsCall()).data;
  },

  // Explicit owner action, limited to the account's pre-existing claimed session.
  // Provider GET only: does not start or repeat a chargeable identity check.
  async reconcileExistingApproval() {
    return (await reconcileCall()).data;
  },

  async start(controlledAdminTest = false) {
    return (await startCall(controlledAdminTest ? { controlledAdminTest: true } : {})).data;
  },

  async adminTestPass() {
    return (await testPassCall()).data;
  },
};
