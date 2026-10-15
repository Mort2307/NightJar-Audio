import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');
export type ReuseStatus = 'none' | 'requested' | 'investigating' | 'waiting_for_member' | 'closed' | 'already_verified';
export type MemberDiditReuse = {
  status: ReuseStatus;
  requestedAt: string | null;
  updatedAt: string | null;
  note: string | null;
  publicVerificationPaused: boolean;
};
export type AdminDiditReuse = {
  uid: string;
  emailMasked: string;
  status: Exclude<ReuseStatus,'none'|'already_verified'>;
  requestedAt: string | null;
  updatedAt: string | null;
};
const memberStatus = httpsCallable<void, MemberDiditReuse>(functions,'myDiditReuseRequest');
const submitRequest = httpsCallable<{ consent: true; previousCheck: 'standalone' }, {status: ReuseStatus}>(functions,'requestDiditReuse');
const withdraw = httpsCallable<void,{status:'closed'}>(functions,'withdrawDiditReuseRequest');
const adminList = httpsCallable<void,{requests:AdminDiditReuse[]}>(functions,'adminListDiditReuseRequests');
const adminReview = httpsCallable<{uid:string;status:'investigating'|'waiting_for_member'|'closed'},{status:string}>(functions,'adminReviewDiditReuseRequest');

export const nightjarDiditReuse = {
  async memberStatus() { return (await memberStatus()).data; },
  async request() { return (await submitRequest({consent:true,previousCheck:'standalone'})).data; },
  async withdraw() { return (await withdraw()).data; },
  async adminList() { return (await adminList()).data; },
  async adminReview(uid:string,status:'investigating'|'waiting_for_member'|'closed') {
    return (await adminReview({uid,status})).data;
  },
};
