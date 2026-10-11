import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type AssistanceAttempt = {
  id: string;
  type: string;
  reasonCode: string;
  createdAt: string | null;
};

export type AssistanceEvent = {
  id: string;
  kind: string;
  status: string;
  note: string;
  by: string;
  createdAt: string | null;
};

export type AccountAssistanceResult = {
  found: boolean;
  email: string;
  message?: string;
  userId?: string;
  displayName?: string;
  emailVerified?: boolean;
  firebaseDisabled?: boolean;
  registered?: boolean;
  administrator?: boolean;
  nightjarStatus?: string;
  betaAllowed?: boolean;
  betaAccessReason?: string;
  canReset?: boolean;
  canVerify?: boolean;
  lastSignIn?: string | null;
  recentFailures?: number;
  firebaseRateLimitObserved?: boolean;
  cooldown?: {
    source: string;
    nightjarCooldownActive: boolean;
    providerUnlockAvailable: boolean;
    endsAt: string | null;
  };
  attempts: AssistanceAttempt[];
  history: AssistanceEvent[];
};

const lookupCall = httpsCallable<{email:string}, AccountAssistanceResult>(functions,'adminAccountAssistanceLookup');
const recoveryEmailCall = httpsCallable<{
  email:string;
  kind:'password_reset' | 'email_verification';
  note:string;
  memberRequested:boolean;
}, {sent:boolean;recipient:string;kind:string}>(functions,'adminSendAccountAssistanceEmail');

export const nightjarAssistance = {
  async lookup(email:string) { return (await lookupCall({email:email.trim()})).data; },
  async sendRecoveryEmail(email:string,kind:'password_reset'|'email_verification',note:string) {
    return (await recoveryEmailCall({email:email.trim(),kind,note:note.trim(),memberRequested:true})).data;
  },
};
