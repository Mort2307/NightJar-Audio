import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');
export type DiditResubmissionReason =
  'unclear_document' | 'wrong_document' | 'expired_document' | 'document_not_detected' | 'other';
export type DiditResubmissionState =
  'none' | 'requested' | 'processing' | 'ready' | 'denied' | 'needs_manual_review';
export type DiditResubmissionStatus = {
  status: DiditResubmissionState;
  reason: DiditResubmissionReason | null;
  cycle: number;
  canRequest: boolean;
  launchUrl: string | null;
  message: string | null;
};
export type AdminDiditResubmissionItem = {
  userId: string;
  email: string;
  revision: number;
  status: 'requested'|'processing'|'needs_manual_review';
  reason: DiditResubmissionReason;
  cycle: number;
  requestedAt: string | null;
};
const status = httpsCallable<void,DiditResubmissionStatus>(functions,'myDiditResubmission');
const request = httpsCallable<
  {reason:DiditResubmissionReason;explicitConsent:true},
  {status:string;alreadyPending:boolean}
>(functions,'requestDiditResubmission');
const queue = httpsCallable<void,{pending:AdminDiditResubmissionItem[];limit:number}>(functions,'adminListDiditResubmissions');
const review = httpsCallable<
  {userId:string;revision:number;action:'approve'|'deny';acknowledgedPossibleCharge:boolean},
  {status:string;providerMutated:boolean}
>(functions,'adminReviewDiditResubmission');
export const nightjarDiditResubmission = {
  async status() { return (await status()).data; },
  async request(reason:DiditResubmissionReason) {
    return (await request({reason,explicitConsent:true})).data;
  },
  async queue() { return (await queue()).data; },
  async review(userId:string,revision:number,action:'approve'|'deny') {
    return (await review({
      userId,revision,action,acknowledgedPossibleCharge:action==='approve',
    })).data;
  },
};
