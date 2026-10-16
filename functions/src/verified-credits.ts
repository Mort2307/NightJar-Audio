import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { randomUUID, createHash } from 'node:crypto';

type Identity = { uid: string; admin: boolean };
type Request = { auth?: { uid: string; token: Record<string, unknown> } | null };
type ClaimState = 'awaiting_uploader' | 'uploader_confirmed' | 'uploader_disputed' | 'uploader_unsure' | 'admin_review' | 'approved' | 'rejected' | 'revoked';
const roles = new Set(['Voice Actor','Writer','Audio Editor','Producer','Director','Sound Designer','Cover Artist','Composer','Other']);
const activeStates = new Set<ClaimState>(['awaiting_uploader','uploader_confirmed','uploader_disputed','uploader_unsure','admin_review','approved']);
const clean = (v: unknown, max = 160) => String(v ?? '').trim().slice(0,max);
const creditRef = (id: string) => getFirestore().collection('verifiedCreditClaims').doc(id);
const auditRef = (id: string) => creditRef(id).collection('audit').doc();
const output = (id: string, data: Record<string, any>) => ({
  id, releaseId:data.releaseId, contributorSlotId:data.contributorSlotId,
  claimantUserId:data.claimantUserId, uploaderUserId:data.uploaderUserId,
  releaseRole:data.releaseRole, state:data.state, source:data.source,
  createdAt:data.createdAt?.toDate?.()?.toISOString?.() ?? null,
  updatedAt:data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
});
const requireInput = (value: unknown, field: string) => {
  const result = clean(value);
  if (!result || result.includes('/')) throw new HttpsError('invalid-argument', 'Invalid '+field+'.');
  return result;
};

/** A restricted, opt-in credit claim workflow; no release attribution is auto-verified. */
export function buildVerifiedCreditCallables(
  requireActive: (request: Request) => Promise<Identity>,
  requireAdmin: (request: Request) => Identity,
) {
  const claimMyReleaseCredit = onCall({ region:'europe-west2' }, async request => {
    const identity = await requireActive(request);
    const input = (request.data ?? {}) as Record<string, unknown>;
    const releaseId = requireInput(input.releaseId,'release');
    const contributorSlotId = requireInput(input.contributorSlotId,'contributor slot');
    const releaseSnap = await getFirestore().collection('releases').doc(releaseId).get();
    const release = releaseSnap.data();
    if (!release || release.status !== 'released') throw new HttpsError('not-found','Published release not found.');
    const slot = (Array.isArray(release.contributors) ? release.contributors : []).find((item:any, i:number) =>
      (clean(item?.slotId) || String(i)) === contributorSlotId);
    if (!slot || !roles.has(slot.role)) throw new HttpsError('invalid-argument','Contributor credit not found.');
    if (release.creatorUserId === identity.uid) throw new HttpsError('failed-precondition','Uploaders cannot independently confirm their own credits.');
    const id = 'claim_'+randomUUID();
    const ref = creditRef(id);
    const now = FieldValue.serverTimestamp();
    // Deterministic lock ensures one active claimant per release slot.
    const lock = getFirestore().collection('verifiedCreditLocks').doc(
      createHash('sha256').update([releaseId,contributorSlotId,identity.uid].join('|')).digest('hex')
    );
    await getFirestore().runTransaction(async tx => {
      const existing = await tx.get(lock);
      if (existing.exists) throw new HttpsError('already-exists','This credit has already been claimed.');
      tx.create(lock,{claimId:id,releaseId,contributorSlotId,claimantUserId:identity.uid,createdAt:now});
      tx.create(ref,{
        releaseId,contributorSlotId,claimantUserId:identity.uid,uploaderUserId:release.creatorUserId,
        releaseRole:slot.role,creditName:clean(slot.name,100),source:'member_claim',state:'awaiting_uploader',
        createdAt:now,updatedAt:now,
      });
      tx.create(auditRef(id),{actorUserId:identity.uid,event:'member_claim',at:now});
    });
    return {claimId:id,state:'awaiting_uploader'};
  });

  const respondToCreditClaim = onCall({ region:'europe-west2' }, async request => {
    const identity = await requireActive(request);
    const input = (request.data ?? {}) as Record<string, unknown>;
    const id = requireInput(input.claimId,'claim');
    const decision = clean(input.decision,24);
    const next: Record<string,ClaimState> = {confirm:'uploader_confirmed',dispute:'uploader_disputed',unsure:'uploader_unsure'};
    if (!next[decision]) throw new HttpsError('invalid-argument','Invalid response.');
    const ref = creditRef(id);
    await getFirestore().runTransaction(async tx => {
      const snap = await tx.get(ref), data = snap.data();
      if (!data || data.uploaderUserId !== identity.uid) throw new HttpsError('permission-denied','Uploader permission required.');
      if (data.state !== 'awaiting_uploader') throw new HttpsError('failed-precondition','Claim has already been answered.');
      tx.update(ref,{state:next[decision],updatedAt:FieldValue.serverTimestamp(),uploaderRespondedAt:FieldValue.serverTimestamp()});
      tx.create(auditRef(id),{actorUserId:identity.uid,event:'uploader_'+decision,at:FieldValue.serverTimestamp()});
    });
    return {state:next[decision]};
  });

  const adminReviewCreditClaim = onCall({ region:'europe-west2' }, async request => {
    const identity = requireAdmin(request);
    const input = (request.data ?? {}) as Record<string,unknown>;
    const id = requireInput(input.claimId,'claim');
    const decision = clean(input.decision,24);
    if (!['approve','reject','revoke'].includes(decision)) throw new HttpsError('invalid-argument','Invalid decision.');
    const ref = creditRef(id);
    await getFirestore().runTransaction(async tx => {
      const snap = await tx.get(ref), data = snap.data();
      if (!data) throw new HttpsError('not-found','Credit claim not found.');
      if ([data.claimantUserId,data.uploaderUserId].includes(identity.uid)) throw new HttpsError('permission-denied','An independent administrator must review this claim.');
      if (decision === 'approve' && data.state !== 'uploader_confirmed') throw new HttpsError('failed-precondition','Uploader confirmation required.');
      if (decision === 'approve') {
        const release = await tx.get(getFirestore().collection('releases').doc(data.releaseId));
        const releaseData = release.data();
        const slot = (Array.isArray(releaseData?.contributors) ? releaseData.contributors : []).find((item:any,i:number) => (clean(item?.slotId) || String(i)) === data.contributorSlotId);
        if (!releaseData || releaseData.status !== 'released' || releaseData.creatorUserId !== data.uploaderUserId || !slot || slot.role !== data.releaseRole || clean(slot.name,100) !== data.creditName) {
          throw new HttpsError('failed-precondition','Release attribution has changed; this claim must be reviewed again.');
        }
      }
      if (decision === 'revoke' && data.state !== 'approved') throw new HttpsError('failed-precondition','Only approved claims can be revoked.');
      if (decision === 'reject' && !activeStates.has(data.state)) throw new HttpsError('failed-precondition','Claim is not pending.');
      const state:ClaimState = decision === 'approve' ? 'approved' : decision === 'revoke' ? 'revoked' : 'rejected';
      tx.update(ref,{
        state,updatedAt:FieldValue.serverTimestamp(),
        ...(state==='approved'?{approvedByAdminUserId:identity.uid,approvedAt:FieldValue.serverTimestamp()}:{}),
        ...(state==='revoked'?{revokedAt:FieldValue.serverTimestamp()}:{}),
        reviewReason:clean(input.reason,600),
      });
      tx.create(auditRef(id),{actorUserId:identity.uid,event:'admin_'+decision,at:FieldValue.serverTimestamp(),reason:clean(input.reason,600)});
      if (state === 'rejected' || state === 'revoked') {
        const lockId = createHash('sha256').update([data.releaseId,data.contributorSlotId,data.claimantUserId].join('|')).digest('hex');
        tx.delete(getFirestore().collection('verifiedCreditLocks').doc(lockId));
      }
    });
    return {state:decision === 'approve'?'approved':decision === 'revoke'?'revoked':'rejected'};
  });

  const listMyCreditClaims = onCall({ region:'europe-west2' }, async request => {
    const identity = await requireActive(request);
    const db = getFirestore();
    const [mine,uploads] = await Promise.all([
      db.collection('verifiedCreditClaims').where('claimantUserId','==',identity.uid).limit(100).get(),
      db.collection('verifiedCreditClaims').where('uploaderUserId','==',identity.uid).limit(100).get(),
    ]);
    const unique = new Map([...mine.docs,...uploads.docs].map(doc => [doc.id,output(doc.id,doc.data())]));
    return {claims:[...unique.values()]};
  });

  const adminListCreditClaims = onCall({ region:'europe-west2' }, async request => {
    requireAdmin(request);
    const snapshot = await getFirestore().collection('verifiedCreditClaims').limit(100).get();
    return {claims:snapshot.docs.map(doc=>output(doc.id,doc.data()))};
  });

  return {claimMyReleaseCredit,respondToCreditClaim,adminReviewCreditClaim,listMyCreditClaims,adminListCreditClaims};
}
