import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type DiditControlledStatus = {
  authorised: boolean;
  state: 'none' | 'authorised' | 'claimed' | 'session_started' |
    'already_verified' | 'requires_review';
  providerVerified: boolean;
  selfServiceEnabled?: boolean;
  launchUrl: string | null;
  publicVerificationPaused: boolean;
};
export type DiditControlledStart = {
  verified?: boolean;
  status?: string;
  sessionId?: string;
  launchUrl?: string;
  provider?: string;
  environment?: string;
  configured?: boolean;
};
const statusCallable = httpsCallable<void,DiditControlledStatus>(functions,'myDiditControlledCheck');
const startCallable = httpsCallable<{explicitConsent:true},DiditControlledStart>(functions,'startMyDiditControlledCheck');
const grantCallable = httpsCallable<{uid:string;acknowledgedCharge:true},{authorised:boolean;sessionStarted:false}>(functions,'adminAuthoriseDiditControlledCheck');

export const nightjarDiditControlled = {
  async status() { return (await statusCallable()).data; },
  async start() { return (await startCallable({explicitConsent:true})).data; },
  async authorise(uid:string) { return (await grantCallable({uid,acknowledgedCharge:true})).data; },
};
