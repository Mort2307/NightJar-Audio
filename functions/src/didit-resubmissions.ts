/**
 * NightJar: user-requested, admin-reviewed Didit ID document resubmissions.
 *
 * Same existing session only. Member/status/list reads cannot mutate Didit.
 * A single explicit admin action can PATCH ONE provider OCR node; ambiguous
 * outcomes permanently require manual review rather than an automatic retry.
 * Never log or persist identity evidence, provider decisions, DOB or ID media.
 *
 * Provider specification: https://docs.didit.me/sessions-api/update-status
 */
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { randomUUID } from 'node:crypto';
import {
  DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_ENVIRONMENT,
  diditConfigured, diditMode, diditPass, verifiedAdultFromDecision,
} from './didit';

type Identity = { uid: string; email: string; admin: boolean };
type RequestState = 'requested' | 'processing' | 'ready' | 'denied' | 'needs_manual_review';
const REGION = 'europe-west2';
const COLLECTION = 'diditResubmissionRequests';
const MAX_PROVIDER_REQUESTS = 2; // Hard per-member/same-session spending guard.
const MAX_MEMBER_REQUESTS = 3;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const reasons = new Set(['unclear_document', 'wrong_document', 'expired_document', 'document_not_detected', 'other']);
const eligibleAgeStates = new Set(['PENDING_REVIEW', 'FAIL', 'ABANDONED', 'EXPIRED', 'PENDING']);
const changeableProviderStates = new Set(['Approved', 'Declined', 'In Review', 'Kyc Expired', 'Abandoned']);
const text = (value: unknown, max=128) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const cleanStatus = (value: unknown): RequestState | 'none' => (
  ['requested', 'processing', 'ready', 'denied', 'needs_manual_review'].includes(String(value))
    ? value as RequestState : 'none'
);
const safeUrl = (value: unknown): string | null => {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && !url.username && !url.password &&
      ['verify.didit.me', 'verification.didit.me'].includes(url.hostname)
      ? url.toString() : null;
  } catch { return null; }
};
const publicStatus = (data: Record<string,any>, link: string | null = null) => ({
  status: cleanStatus(data.status),
  reason: reasons.has(data.reason) ? data.reason : null,
  cycle: Number(data.cycle ?? 0),
  canRequest: false,
  launchUrl: link,
  message: text(data.publicMessage, 240) || null,
});
const ageRef = (uid:string) => getFirestore().collection('ageAssurance').doc(uid);
const requestRef = (uid:string) => getFirestore().collection(COLLECTION).doc(uid);
const sessionRef = (sessionId:string) => getFirestore().collection('diditSessions').doc(sessionId);
const isAccountBound = (uid:string, age:Record<string,any>, session:Record<string,any>) =>
  age.provider === 'didit' && age.environment === 'live' &&
  session.uid === uid && session.environment === 'live' &&
  session.workflowId === DIDIT_WORKFLOW_ID.value() &&
  age.sessionId && typeof age.sessionId === 'string';

const genericMessage = 'NightJar needs to review this existing Didit result. Please do not start another check.';
const verifiedMessage = 'An existing verified 18+ result needs no resubmission.';
const readyMessage = 'Your approved document resubmission is ready. Open the existing Didit verification link to upload a replacement.';

export function buildDiditResubmissionCallables(deps: {
  requireActiveIdentity: (request: any) => Promise<Identity>;
  requireAdminIdentity: (request: any) => Identity;
}) {
  const myDiditResubmission = onCall({region:REGION}, async request => {
    const identity = await deps.requireActiveIdentity(request);
    const [ageSnap, formSnap] = await Promise.all([ageRef(identity.uid).get(), requestRef(identity.uid).get()]);
    const age = ageSnap.data() ?? {}, form = formSnap.data() ?? {};
    if (diditPass(age)) return {...publicStatus(form), canRequest:false, message:verifiedMessage};
    if (!age.sessionId || age.provider !== 'didit' || age.environment !== 'live')
      return {...publicStatus(form), canRequest:false, message:'No existing live verification is linked to this account.'};
    const session = (await sessionRef(text(age.sessionId)).get()).data() ?? {};
    if (!isAccountBound(identity.uid, age, session)) return {...publicStatus(form), canRequest:false, message:genericMessage};
    const sameSession = form.sessionId === age.sessionId;
    const current = sameSession ? form : {};
    const state = cleanStatus(current.status);
    const sent = Number(current.providerRequests ?? 0);
    const requested = Number(current.memberRequests ?? 0);
    const ageEligible = eligibleAgeStates.has(String(age.status)) && !diditPass(age);
    const cooldown = Number(current.lastProviderRequestMs ?? 0) + COOLDOWN_MS > Date.now();
    const canRequest = ageEligible && sent < MAX_PROVIDER_REQUESTS &&
      requested < MAX_MEMBER_REQUESTS && !['requested','processing','needs_manual_review'].includes(state) &&
      (state !== 'ready' || !cooldown);
    const launchUrl = state === 'ready' && sameSession ? safeUrl(session.url) : null;
    return {
      ...publicStatus(current, launchUrl),
      canRequest,
      message: state === 'ready' ? readyMessage :
        state === 'requested' ? 'Your request is awaiting NightJar review; no new check has started.' :
        state === 'processing' ? 'NightJar is checking the existing Didit session. Please do not retry.' :
        state === 'needs_manual_review' ? genericMessage :
        state === 'denied' ? 'NightJar reviewed this request. Contact support if you need further help.' : null,
    };
  });

  const requestDiditResubmission = onCall({region:REGION}, async request => {
    const identity = await deps.requireActiveIdentity(request);
    const reason = text((request.data as Record<string,unknown> | undefined)?.reason,40);
    if (!reasons.has(reason) || (request.data as Record<string,unknown> | undefined)?.explicitConsent !== true)
      throw new HttpsError('invalid-argument','Select a document issue and confirm that you want NightJar to review the existing session.');
    if (!diditConfigured() || diditMode() !== 'live')
      throw new HttpsError('failed-precondition','Live Didit is unavailable; no verification was started.');
    const result = await getFirestore().runTransaction(async tx => {
      const a = ageRef(identity.uid), r = requestRef(identity.uid);
      const [as, rs] = await Promise.all([tx.get(a), tx.get(r)]);
      const age = as.data() ?? {}, prior = rs.data() ?? {};
      if (diditPass(age)) throw new HttpsError('failed-precondition',verifiedMessage);
      if (!eligibleAgeStates.has(String(age.status)) || !age.sessionId)
        throw new HttpsError('failed-precondition','The existing verification is still in progress or cannot be resubmitted. Contact NightJar support.');
      const session = (await tx.get(sessionRef(text(age.sessionId)))).data() ?? {};
      if (!isAccountBound(identity.uid, age, session))
        throw new HttpsError('failed-precondition','No safely linked live Didit session was found.');
      const sameSession = prior.sessionId === age.sessionId;
      const used = sameSession ? Number(prior.providerRequests ?? 0) : 0;
      const memberRequests = sameSession ? Number(prior.memberRequests ?? 0) : 0;
      const status = sameSession ? cleanStatus(prior.status) : 'none';
      if (['requested','processing','needs_manual_review'].includes(status))
        return {status, alreadyPending:true};
      if (used >= MAX_PROVIDER_REQUESTS || memberRequests >= MAX_MEMBER_REQUESTS)
        throw new HttpsError('resource-exhausted','Document resubmission limit reached. NightJar support must review the original session.');
      if (status === 'ready' && Number(prior.lastProviderRequestMs ?? 0) + COOLDOWN_MS > Date.now())
        throw new HttpsError('failed-precondition','Your previous resubmission is still available. Continue it before requesting another review.');
      const revision = (sameSession ? Number(prior.revision ?? 0) : 0) + 1;
      tx.set(r, {
        uid:identity.uid, sessionId:age.sessionId, status:'requested', reason,
        revision, cycle:used, providerRequests:used, memberRequests:memberRequests+1,
        lastProviderRequestMs:sameSession ? Number(prior.lastProviderRequestMs ?? 0) : 0,
        publicMessage:null, requestedAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
      });
      return {status:'requested', alreadyPending:false};
    });
    return result;
  });

  const adminListDiditResubmissions = onCall({region:REGION}, async request => {
    deps.requireAdminIdentity(request);
    const snapshot = await getFirestore().collection(COLLECTION).where('status','==','requested').limit(40).get();
    const pending = await Promise.all(snapshot.docs.map(async doc => {
      const row = doc.data();
      const account = (await getFirestore().collection('accounts').doc(doc.id).get()).data() ?? {};
      return {
        userId:doc.id, email:text(account.email,160) || 'Unknown account',
        revision:Number(row.revision ?? 0), reason:reasons.has(row.reason) ? row.reason : 'other',
        cycle:Number(row.providerRequests ?? 0), requestedAt:row.requestedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    }));
    return {pending:pending.sort((a,b)=>String(a.requestedAt ?? '').localeCompare(String(b.requestedAt ?? ''))),limit:40};
  });

  const adminReviewDiditResubmission = onCall({
    region:REGION,
    secrets:[DIDIT_API_KEY,DIDIT_WORKFLOW_ID,DIDIT_ENVIRONMENT],
    timeoutSeconds:45, maxInstances:2,
  }, async request => {
    const admin = deps.requireAdminIdentity(request);
    const payload = (request.data ?? {}) as Record<string,unknown>;
    const uid = text(payload.userId,128);
    const revision = Number(payload.revision);
    const action = text(payload.action,20);
    if (!/^[a-zA-Z0-9_-]{10,128}$/.test(uid) || !Number.isSafeInteger(revision) || revision < 1 ||
        !['approve','deny'].includes(action))
      throw new HttpsError('invalid-argument','Select a valid pending request and review action.');
    if (uid === admin.uid) throw new HttpsError('permission-denied','An administrator cannot review their own identity resubmission.');
    if (action === 'approve' && payload.acknowledgedPossibleCharge !== true)
      throw new HttpsError('failed-precondition','Explicitly acknowledge that the selected OCR check and any dependent checks may incur Didit charges.');
    if (action === 'approve' && (!diditConfigured() || diditMode() !== 'live'))
      throw new HttpsError('failed-precondition','Live Didit not configured; no resubmission started.');

    const claimId=randomUUID();
    const data=await getFirestore().runTransaction(async tx=>{
      const r=requestRef(uid),a=ageRef(uid);
      const [rs,as,account]=await Promise.all([tx.get(r),tx.get(a),tx.get(getFirestore().collection('accounts').doc(uid))]);
      const item=rs.data() ?? {},age=as.data() ?? {};
      if (!account.exists || account.data()?.status === 'suspended')
        throw new HttpsError('failed-precondition','Account is no longer eligible for verification assistance.');
      if (item.status !== 'requested' || Number(item.revision) !== revision)
        throw new HttpsError('aborted','This request changed. Refresh the pending queue; do not retry blindly.');
      if (diditPass(age) || age.sessionId !== item.sessionId || !eligibleAgeStates.has(String(age.status)))
        throw new HttpsError('failed-precondition','The account verification changed. Reconcile its existing result before resubmitting.');
      const session = (await tx.get(sessionRef(text(item.sessionId)))).data() ?? {};
      if (!isAccountBound(uid,age,session))
        throw new HttpsError('failed-precondition','The existing Didit session is not securely bound to this account.');
      if (Number(item.providerRequests ?? 0) >= MAX_PROVIDER_REQUESTS)
        throw new HttpsError('resource-exhausted','This account reached its same-session resubmission limit.');
      if (action === 'deny') {
        tx.update(r,{
          status:'denied', reviewedBy:admin.uid, reviewedAt:FieldValue.serverTimestamp(),
          updatedAt:FieldValue.serverTimestamp(), publicMessage:'Resubmission not authorised. Contact NightJar support.',
        });
        return null;
      }
      // Durable one-shot claim BEFORE contacting Didit; uncertain outcomes never auto-retry.
      tx.update(r,{
        status:'processing', claimId, reviewedBy:admin.uid,
        providerRequests:Number(item.providerRequests ?? 0)+1,
        reviewedAt:FieldValue.serverTimestamp(), providerAttemptAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
      });
      return {sessionId:text(item.sessionId), workflowId:session.workflowId, applicationId:session.applicationId};
    });
    if (!data) return {status:'denied',providerMutated:false};
    const finish = async (status:RequestState, publicMessage:string) => {
      await getFirestore().runTransaction(async tx=>{
        const ref=requestRef(uid), current=(await tx.get(ref)).data() ?? {};
        if (current.claimId !== claimId || current.revision !== revision) return;
        tx.update(ref,{
          status, publicMessage, updatedAt:FieldValue.serverTimestamp(),
          ...(status === 'ready' ? {lastProviderRequestMs:Date.now(),cycle:Number(current.providerRequests ?? 1)} : {}),
        });
      });
      return {status, providerMutated:status==='ready'};
    };
    const manual=(reason:string) => finish('needs_manual_review',reason);
    // GET is read-only but contains PII: do not log, return or persist the payload.
    let decision:Record<string,any>;
    try {
      const response=await fetch('https://verification.didit.me/v3/session/'+encodeURIComponent(data.sessionId)+'/decision/',{
        method:'GET',headers:{'x-api-key':DIDIT_API_KEY.value(),Accept:'application/json'},
        signal:AbortSignal.timeout(12000),
      });
      if (!response.ok) return manual(genericMessage);
      decision=await response.json() as Record<string,any>;
    } catch { return manual(genericMessage); }
    if (!decision || decision.session_id !== data.sessionId || decision.vendor_data !== uid ||
        decision.workflow_id !== data.workflowId || decision.environment !== 'live' ||
        decision.session_kind !== 'user' ||
        (data.applicationId && decision.application_id !== data.applicationId))
      return manual('Didit account binding must be investigated. No resubmission was requested.');
    if (!changeableProviderStates.has(String(decision.status)))
      return manual('Didit is not currently in a state eligible for a document resubmission.');
    if (decision.status === 'Approved' && verifiedAdultFromDecision(decision))
      return manual('Didit already provides adult evidence. Reconcile the existing approval instead of resubmitting.');

    const ids=Array.isArray(decision.id_verifications) ? decision.id_verifications : [];
    // Do not silently choose among multiple document nodes or restart an approved
    // OCR step merely because DOB was hidden by the workflow's returned-data setting.
    if (ids.length !== 1) return manual('Review the ID step and workflow settings in Didit before requesting resubmission.');
    const id=ids[0];
    const nodeId=typeof id?.node_id==='string' && /^feature_[a-zA-Z0-9_-]{2,100}$/.test(id.node_id) ? id.node_id : null;
    if (!nodeId || (id.verification_method && id.verification_method !== 'document'))
      return manual('No single supported documentary ID step was found. Review the workflow in Didit.');
    if (id.status === 'Approved')
      return manual('ID step already Approved. Check missing date-of-birth return settings before requesting another paid check.');
    if (!['Declined','In Review','Not Finished','Expired'].includes(String(id.status)))
      return manual('The ID step is not an eligible failed document check. Review the result in Didit.');

    // If the provider PATCH times out or produces an ambiguous response, the
    // durable processing claim remains consumed. NEVER retry automatically.
    try {
      const result=await fetch('https://verification.didit.me/v3/session/'+encodeURIComponent(data.sessionId)+'/update-status/',{
        method:'PATCH',
        headers:{'x-api-key':DIDIT_API_KEY.value(),'content-type':'application/json'},
        body:JSON.stringify({
          new_status:'Resubmitted',
          nodes_to_resubmit:[{node_id:nodeId,feature:'OCR'}],
          comment:'NightJar reviewed a member request for replacement ID document; redo the documentary ID step only.',
          send_email:false,
        }),
        signal:AbortSignal.timeout(15000),
      });
      if (!result.ok) return manual('Didit did not confirm the resubmission. Check the same session in Didit before trying anything further.');
      const response=await result.json() as Record<string,unknown>;
      if (response?.session_id !== data.sessionId)
        return manual('Didit returned an unexpected response. Review the existing session before any other action.');
      return finish('ready',readyMessage);
    } catch {
      return manual('Didit result is uncertain. Check the original session in Didit; do not repeat the provider request.');
    }
  });

  return {myDiditResubmission,requestDiditResubmission,adminListDiditResubmissions,adminReviewDiditResubmission};
}
