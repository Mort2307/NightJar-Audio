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
import { selectDocumentResubmission, canRequestNewReview, describeDiditDocumentIssue } from './didit-resubmission-guards';

type Identity = { uid: string; email: string; admin: boolean };
type RequestState = 'requested' | 'processing' | 'ready' | 'denied' | 'needs_manual_review';
const REGION = 'europe-west2';
const COLLECTION = 'diditResubmissionRequests';
const MAX_PROVIDER_REQUESTS = 2; // Hard per-member/same-session spending guard.
const MAX_MEMBER_REQUESTS = 3;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const reasons = new Set(['unclear_document', 'wrong_document', 'expired_document', 'document_not_detected', 'other']);
const eligibleAgeStates = new Set(['PENDING_REVIEW', 'FAIL', 'ABANDONED', 'EXPIRED']);
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
  const myDiditResubmission = onCall({region:REGION,secrets:[DIDIT_API_KEY,DIDIT_WORKFLOW_ID,DIDIT_ENVIRONMENT]}, async request => {
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
    const canRequestByLimits = ageEligible && canRequestNewReview({
      accountStatus:String(age.status), providerRequests:sent, memberRequests:requested,
      requestStatus:state, lastProviderRequestMs:Number(current.lastProviderRequestMs ?? 0), now:Date.now(),
    });
    const launchUrl = state === 'ready' && sameSession ? safeUrl(session.url) : null;
    let guidance:ReturnType<typeof describeDiditDocumentIssue> | null = null;
    let guidanceUnavailable = false;
    let providerAllowsResubmission = false;
    // A read-only provider decision lookup supplies a whitelisted reason code.
    // Raw decision data, document media, DOB and provider text never leave this function.
    if (ageEligible && ['none','denied','ready'].includes(state)) {
      if (!diditConfigured() || diditMode() !== 'live') guidanceUnavailable = true;
      else {
      try {
        const response = await fetch('https://verification.didit.me/v3/session/'+encodeURIComponent(text(age.sessionId))+'/decision/',{
          method:'GET',headers:{'x-api-key':DIDIT_API_KEY.value(),Accept:'application/json'},
          signal:AbortSignal.timeout(10000),
        });
        if (response.ok) {
          const decision = await response.json() as Record<string,any>;
          const bound = decision?.session_id === age.sessionId && decision?.vendor_data === identity.uid &&
            decision?.workflow_id === session.workflowId && decision?.environment === 'live' &&
            decision?.session_kind === 'user' &&
            (!session.applicationId || decision?.application_id === session.applicationId);
          if (bound) {
            const adultEvidence = verifiedAdultFromDecision(decision);
            guidance = describeDiditDocumentIssue(decision,adultEvidence);
            providerAllowsResubmission = selectDocumentResubmission(decision,adultEvidence).allowed;
          } else guidanceUnavailable = true;
        } else guidanceUnavailable = true;
      } catch { guidanceUnavailable = true; }
      }
    }
    const canRequest = canRequestByLimits && guidance?.canRetake === true && providerAllowsResubmission;
    return {
      ...publicStatus(current, launchUrl),
      canRequest,
      guidance,
      guidanceUnavailable,
      message: state === 'ready' ? readyMessage :
        state === 'requested' ? 'Your request is awaiting NightJar review; no new check has started.' :
        state === 'processing' ? 'NightJar is checking the existing Didit session. Please do not retry.' :
        state === 'needs_manual_review' ? genericMessage :
        state === 'denied' ? 'NightJar reviewed this request. Contact support if you need further help.' :
        guidanceUnavailable ? 'NightJar could not safely retrieve the individual Didit result. Please contact support; do not start another check.' :
        guidance?.explanation ?? null,
    };
  });

  const requestDiditResubmission = onCall({region:REGION,secrets:[DIDIT_API_KEY,DIDIT_WORKFLOW_ID,DIDIT_ENVIRONMENT]}, async request => {
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
    const snapshot = await getFirestore().collection(COLLECTION).where('status','in',['requested','processing','needs_manual_review']).limit(80).get();
    const pending = await Promise.all(snapshot.docs.map(async doc => {
      const row = doc.data();
      const account = (await getFirestore().collection('accounts').doc(doc.id).get()).data() ?? {};
      return {
        userId:doc.id, email:text(account.email,160) || 'Unknown account',
        revision:Number(row.revision ?? 0), status:cleanStatus(row.status), reason:reasons.has(row.reason) ? row.reason : 'other',
        cycle:Number(row.providerRequests ?? 0), requestedAt:row.requestedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    }));
    return {pending:pending.sort((a,b)=>String(a.requestedAt ?? '').localeCompare(String(b.requestedAt ?? ''))),limit:80};
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
    const selection=selectDocumentResubmission(decision,verifiedAdultFromDecision(decision));
    if(!selection.allowed) {
      const guidance:Record<string,string>={
        provider_status:'Didit is not currently in a state eligible for a document resubmission.',
        already_adult:'Didit already provides adult evidence. Reconcile the existing approval.',
        missing_or_multiple_id_steps:'Review the ID step and workflow settings in Didit before requesting resubmission.',
        unsupported_document_node:'No single supported documentary ID step was found. Review the workflow in Didit.',
        document_not_retakeable:'This Didit result cannot be safely resubmitted. Review the document warning and active workflow settings first. No provider resubmission was sent.',
        approved_id_without_adult_evidence:'ID step already Approved. Check missing date-of-birth return settings before requesting another paid check.',
        id_not_rejectable:'The ID step is not an eligible failed document check. Review the result in Didit.',
      };
      return manual(guidance[selection.reason] ?? genericMessage);
    }
    // A genuine approval or account change may arrive during the provider read.
    // Re-check immediately before PATCH; never alter a new/superseding session.
    const [freshAgeSnap,freshSessionSnap]=await Promise.all([
      ageRef(uid).get(),sessionRef(data.sessionId).get(),
    ]);
    const freshAge=freshAgeSnap.data() ?? {},freshSession=freshSessionSnap.data() ?? {};
    if(diditPass(freshAge) || freshAge.sessionId!==data.sessionId ||
      !eligibleAgeStates.has(String(freshAge.status)) ||
      !isAccountBound(uid,freshAge,freshSession))
      return manual('The linked account changed before resubmission; reconcile the existing result first.');

    // If the provider PATCH times out or produces an ambiguous response, the
    // durable processing claim remains consumed. NEVER retry automatically.
    try {
      const result=await fetch('https://verification.didit.me/v3/session/'+encodeURIComponent(data.sessionId)+'/update-status/',{
        method:'PATCH',
        headers:{'x-api-key':DIDIT_API_KEY.value(),'content-type':'application/json'},
        body:JSON.stringify({
          new_status:'Resubmitted',
          nodes_to_resubmit:[{node_id:selection.nodeId,feature:'OCR'}],
          comment:'NightJar reviewed a member request for replacement ID document; redo the documentary ID step only.',
          send_email:false,
        }),
        signal:AbortSignal.timeout(15000),
      });
      if (!result.ok) return manual('Didit did not confirm the resubmission. Check the same session in Didit before trying anything further.');
      const response=await result.json() as Record<string,unknown>;
      if (response?.session_id !== data.sessionId)
        return manual('Didit returned an unexpected response. Review the existing session before any other action.');
      // Didit can issue a refreshed resume URL for a resubmitted older session.
      // Read only the EXISTING session again; validate the account binding
      // and fixed provider host before replacing the stored opaque link.
      try {
        const latest=await fetch('https://verification.didit.me/v3/session/'+encodeURIComponent(data.sessionId)+'/decision/',{
          method:'GET',headers:{'x-api-key':DIDIT_API_KEY.value(),Accept:'application/json'},
          signal:AbortSignal.timeout(10000),
        });
        if(latest.ok) {
          const refreshed=await latest.json() as Record<string,unknown>;
          const url=safeUrl(refreshed?.session_url);
          if(url && refreshed.session_id===data.sessionId && refreshed.vendor_data===uid &&
            refreshed.workflow_id===data.workflowId && refreshed.environment==='live' &&
            refreshed.session_kind==='user' &&
            (!data.applicationId || refreshed.application_id===data.applicationId)) {
            await getFirestore().runTransaction(async tx=>{
              const ref=sessionRef(data.sessionId),snapshot=await tx.get(ref);
              const current=snapshot.data() ?? {};
              if(current.uid===uid && current.workflowId===data.workflowId && current.environment==='live')
                tx.update(ref,{url,updatedAt:FieldValue.serverTimestamp()});
            });
          }
        }
      } catch { /* Resubmission accepted; original bound URL remains available. Never retry PATCH. */ }
      return finish('ready',readyMessage);
    } catch {
      return manual('Didit result is uncertain. Check the original session in Didit; do not repeat the provider request.');
    }
  });

  return {myDiditResubmission,requestDiditResubmission,adminListDiditResubmissions,adminReviewDiditResubmission};
}
