import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');
export type ReuseStatus = 'none' | 'requested' | 'investigating' | 'waiting_for_member' | 'approved_for_reuse' | 'closed' | 'already_verified';
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
const adminReview = httpsCallable<{uid:string;status:'investigating'|'waiting_for_member'|'approved_for_reuse'|'closed'},{status:string}>(functions,'adminReviewDiditReuseRequest');

export type DiditReuseWorkflowReadiness = {
  workflowRecognised: boolean;
  workflowLabel: string | null;
  published: boolean;
  zeroCostConfirmed: boolean;
  reusableShapeConfirmed: boolean;
  sessionLaunchEnabled: boolean;
  providerSourceBindingConfirmed: boolean;
  publicVerificationPaused: boolean;
};
type DiditSourceInspection = {
  existingApprovalFound: boolean;
  sourceUniquelyReserved: boolean;
  memberVerified: false;
  nextStep: string;
};
type DiditWorkflowInspection = {
  workflowRecognised: boolean; published: boolean; zeroCostConfirmed: boolean;
  reusableShapeConfirmed: boolean; workflowLabel: string;
  sessionLaunchEnabled: false; nextStep: string;
};
const inspectReuseWorkflow = httpsCallable<{workflowId:string}, DiditWorkflowInspection>(functions,'adminInspectDiditReuseWorkflow');
const bindReuseSource = httpsCallable<{uid:string;sessionId:string}, DiditSourceInspection>(functions,'adminBindExistingDiditSource');
const reuseReadiness = httpsCallable<void,DiditReuseWorkflowReadiness>(functions,'adminDiditReuseReadiness');

export const nightjarDiditReuse = {
  async readiness() { return (await reuseReadiness()).data; },
  async inspectWorkflow(workflowId:string) { return (await inspectReuseWorkflow({workflowId})).data; },
  async inspectOriginal(uid:string,sessionId:string) { return (await bindReuseSource({uid,sessionId})).data; },
  async memberStatus() { return (await memberStatus()).data; },
  async request() { return (await submitRequest({consent:true,previousCheck:'standalone'})).data; },
  async withdraw() { return (await withdraw()).data; },
  async adminList() { return (await adminList()).data; },
  async adminReview(uid:string,status:'investigating'|'waiting_for_member'|'approved_for_reuse'|'closed') {
    return (await adminReview({uid,status})).data;
  },
};
