import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp,'europe-west2');

export type DiditSingleMemberPilotStatus = {
  stage: 'not_authorised' | 'ready' | 'session_claimed' | 'expired' | 'verified';
  verified: boolean;
  approvedForOneAttempt: boolean;
  existingLaunchUrl: string | null;
  publicVerificationPaused: boolean;
};
export type DiditMemberStartResult = {
  sessionId?: string;
  launchUrl?: string;
  verified?: boolean;
  status?: string;
  provider?: string;
  environment?: string;
};
const myPilotStatus = httpsCallable<void,DiditSingleMemberPilotStatus>(functions,'myDiditMemberNormalPilot');
const approvePilot = httpsCallable<{
  uid:string; acceptPotentialCharge:true; confirmOneAttemptOnly:true;
}, { authorised:true; memberEmailMasked:string; expiresInHours:number }>(functions,'adminAuthoriseDiditMemberNormalPilot');
export type DiditSinglePilotAdminStatus = {
  status:'unused'|'authorised'|'claimed';
  memberUid:string|null;
  authorisedAt:string|null;
  claimedAt:string|null;
  expiresAtMs:number|null;
  chargeAcknowledged:boolean;
  publicVerificationPaused:boolean;
};
const adminPilotStatus = httpsCallable<void,DiditSinglePilotAdminStatus>(functions,'adminDiditMemberNormalPilotStatus');
const launchPilot = httpsCallable<{ controlledMemberPilot:true },DiditMemberStartResult>(functions,'startAgeAssurance');

export const nightjarSingleDiditPilot = {
  async adminStatus() { return (await adminPilotStatus()).data; },
  async myStatus() { return (await myPilotStatus()).data; },
  async adminAuthorise(uid:string) {
    return (await approvePilot({uid,acceptPotentialCharge:true,confirmOneAttemptOnly:true})).data;
  },
  async startOneCheck() { return (await launchPilot({controlledMemberPilot:true})).data; },
};
