import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { randomUUID, createHash } from 'node:crypto';

type Identity = { uid: string; admin: boolean };
type Request = { auth?: { uid: string; token: Record<string, unknown> } | null };
type ClaimState = 'awaiting_member' | 'awaiting_uploader' | 'uploader_confirmed' | 'uploader_disputed' | 'uploader_unsure' | 'admin_review' | 'approved' | 'rejected' | 'revoked';
const roles = new Set(['Voice Actor','Writer','Audio Editor','Producer','Director','Sound Designer','Cover Artist','Composer','Other']);
const activeStates = new Set<ClaimState>(['awaiting_member','awaiting_uploader','uploader_confirmed','uploader_disputed','uploader_unsure','admin_review','approved']);
const clean = (v: unknown, max = 160) => String(v ?? '').trim().slice(0,max);
const creditRef = (id: string) => getFirestore().collection('verifiedCreditClaims').doc(id);
const auditRef = (id: string) => creditRef(id).collection('audit').doc();
const output = (id: string, data: Record<string, any>) => ({
  id, releaseId:data.releaseId, contributorSlotId:data.contributorSlotId,
  claimantUserId:data.claimantUserId, uploaderUserId:data.uploaderUserId,
  releaseRole:data.releaseRole, state:data.state, source:data.source,
  createdAt:data.createdAt?.toDate?.()?.toISOString?.() ?? null,
  updatedAt:data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
  appealPending:data.appealPending === true,
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
  requireAgeVerified: (uid: string) => Promise<unknown>,
) {
  const claimMyReleaseCredit = onCall({ region:'europe-west2' }, async request => {
    const identity = await requireActive(request);
    await requireAgeVerified(identity.uid);
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
    // One lock per release slot prevents conflicting approved claimants.
    const lock = getFirestore().collection('verifiedCreditLocks').doc(
      createHash('sha256').update([releaseId,contributorSlotId].join('|')).digest('hex')
    );
    await getFirestore().runTransaction(async tx => {
      const existing = await tx.get(lock);
      if (existing.exists) throw new HttpsError('already-exists','This credit slot already has an active claim. Ask the uploader or an administrator to resolve it.');
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
    await requireAgeVerified(identity.uid);
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
    await requireAgeVerified(identity.uid);
    const input = (request.data ?? {}) as Record<string,unknown>;
    const id = requireInput(input.claimId,'claim');
    const decision = clean(input.decision,24);
    if (!['approve','reject','revoke','resolve_appeal'].includes(decision)) throw new HttpsError('invalid-argument','Invalid decision.');
    if (decision !== 'approve' && !clean(input.reason,600)) throw new HttpsError('invalid-argument','A review reason is required for rejection or revocation.');
    const ref = creditRef(id);
    await getFirestore().runTransaction(async tx => {
      const snap = await tx.get(ref), data = snap.data();
      if (!data) throw new HttpsError('not-found','Credit claim not found.');
      if ([data.claimantUserId,data.uploaderUserId].includes(identity.uid)) throw new HttpsError('permission-denied','An independent administrator must review this claim.');
      if (decision === 'resolve_appeal') {
        if (data.appealPending !== true || !['rejected','revoked'].includes(data.state)) throw new HttpsError('failed-precondition','No pending appeal to resolve.');
        tx.update(ref,{appealPending:false,appealResolvedAt:FieldValue.serverTimestamp(),appealResolvedByAdminUserId:identity.uid,appealResolution:clean(input.reason,600),updatedAt:FieldValue.serverTimestamp()});
        tx.create(auditRef(id),{actorUserId:identity.uid,event:'admin_resolve_appeal',reason:clean(input.reason,600),at:FieldValue.serverTimestamp()});
        return;
      }
      if (decision === 'approve' && data.state !== 'uploader_confirmed') throw new HttpsError('failed-precondition','Uploader confirmation required.');
      // Every Firestore transaction read must precede its first write.
      let approvedRelease: FirebaseFirestore.DocumentSnapshot | null = null;
      if (decision === 'approve') approvedRelease = await tx.get(getFirestore().collection('releases').doc(data.releaseId));
      if (decision === 'approve') {
        const release = approvedRelease!;
        const releaseData = release.data();
        const slot = (Array.isArray(releaseData?.contributors) ? releaseData.contributors : []).find((item:any,i:number) => (clean(item?.slotId) || String(i)) === data.contributorSlotId);
        if (!releaseData || releaseData.status !== 'released' || releaseData.creatorUserId !== data.uploaderUserId || !slot || slot.role !== data.releaseRole || clean(slot.name,100) !== data.creditName) {
          throw new HttpsError('failed-precondition','Release attribution has changed; this claim must be reviewed again.');
        }
      }
      if (decision === 'revoke' && data.state !== 'approved') throw new HttpsError('failed-precondition','Only approved claims can be revoked.');
      if (decision === 'reject' && (!activeStates.has(data.state) || data.state === 'approved')) throw new HttpsError('failed-precondition','Claim is not pending.');
      const state:ClaimState = decision === 'approve' ? 'approved' : decision === 'revoke' ? 'revoked' : 'rejected';
      let ownedLockRef: FirebaseFirestore.DocumentReference | null = null;
      if (state === 'rejected' || state === 'revoked') {
        const lockId = createHash('sha256').update([data.releaseId,data.contributorSlotId].join('|')).digest('hex');
        const lockRef = getFirestore().collection('verifiedCreditLocks').doc(lockId);
        // Firestore transactions require every read before the first write.
        const lockSnap = await tx.get(lockRef);
        if (lockSnap.exists && lockSnap.get('claimId') === id) ownedLockRef = lockRef;
      }
      tx.update(ref,{
        state,updatedAt:FieldValue.serverTimestamp(),
        ...(state==='approved'?{approvedByAdminUserId:identity.uid,approvedAt:FieldValue.serverTimestamp()}:{}),
        ...(state==='revoked'?{revokedAt:FieldValue.serverTimestamp()}:{}),
        reviewReason:clean(input.reason,600),
      });
      tx.create(auditRef(id),{actorUserId:identity.uid,event:'admin_'+decision,at:FieldValue.serverTimestamp(),reason:clean(input.reason,600)});
      if (ownedLockRef) tx.delete(ownedLockRef);
    });
    return {state:decision === 'approve'?'approved':decision === 'revoke'?'revoked':decision === 'resolve_appeal'?'appeal_resolved':'rejected'};
  });

  const inviteCreditedContributor = onCall({ region:'europe-west2' }, async request => {
    const identity = await requireActive(request);
    await requireAgeVerified(identity.uid);
    const input = (request.data ?? {}) as Record<string,unknown>;
    const releaseId = requireInput(input.releaseId,'release');
    const contributorSlotId = requireInput(input.contributorSlotId,'contributor slot');
    const invitedUserId = requireInput(input.invitedUserId,'member account');
    if (invitedUserId === identity.uid) throw new HttpsError('failed-precondition','Uploader self-invitations require independent corroboration.');
    const db = getFirestore();
    const releaseSnap = await db.collection('releases').doc(releaseId).get();
    const release = releaseSnap.data();
    if (!release || release.status !== 'released' || release.creatorUserId !== identity.uid) throw new HttpsError('permission-denied','Only the published release uploader can invite a contributor.');
    const slot = (Array.isArray(release.contributors) ? release.contributors : []).find((item:any,i:number) => (clean(item?.slotId)||String(i)) === contributorSlotId);
    if (!slot || !roles.has(slot.role)) throw new HttpsError('invalid-argument','Contributor slot not found.');
    const member = await db.collection('accounts').doc(invitedUserId).get();
    if (!member.exists || member.get('accountStatus') === 'suspended' || member.get('status') === 'suspended') throw new HttpsError('not-found','Eligible member account not found.');
    const id = 'claim_'+randomUUID(), ref = creditRef(id), now = FieldValue.serverTimestamp();
    const lock = db.collection('verifiedCreditLocks').doc(createHash('sha256').update([releaseId,contributorSlotId].join('|')).digest('hex'));
    await db.runTransaction(async tx => {
      const existing = await tx.get(lock);
      if (existing.exists) throw new HttpsError('already-exists','This contributor slot already has an active credit request.');
      tx.create(lock,{claimId:id,releaseId,contributorSlotId,claimantUserId:invitedUserId,createdAt:now});
      tx.create(ref,{releaseId,contributorSlotId,claimantUserId:invitedUserId,uploaderUserId:identity.uid,releaseRole:slot.role,creditName:clean(slot.name,100),source:'uploader_invitation',state:'awaiting_member',createdAt:now,updatedAt:now});
      tx.create(auditRef(id),{actorUserId:identity.uid,event:'uploader_invitation',at:now});
    });
    return {claimId:id,state:'awaiting_member'};
  });

  const respondToCreditInvitation = onCall({ region:'europe-west2' }, async request => {
    const identity = await requireActive(request);
    await requireAgeVerified(identity.uid);
    const input = (request.data ?? {}) as Record<string,unknown>;
    const id = requireInput(input.claimId,'claim');
    const decision = clean(input.decision,24);
    if (!['accept','decline'].includes(decision)) throw new HttpsError('invalid-argument','Invalid invitation response.');
    const ref = creditRef(id);
    await getFirestore().runTransaction(async tx => {
      const snap = await tx.get(ref), data = snap.data();
      if (!data || data.claimantUserId !== identity.uid || data.source !== 'uploader_invitation') throw new HttpsError('permission-denied','Only the invited member can respond.');
      if (data.state !== 'awaiting_member') throw new HttpsError('failed-precondition','Invitation is no longer pending.');
      const state = decision === 'accept' ? 'uploader_confirmed' : 'rejected';
      let ownedLockRef: FirebaseFirestore.DocumentReference | null = null;
      if (decision === 'decline') {
        const lockRef = getFirestore().collection('verifiedCreditLocks').doc(createHash('sha256').update([data.releaseId,data.contributorSlotId].join('|')).digest('hex'));
        const lockSnap = await tx.get(lockRef);
        if (lockSnap.exists && lockSnap.get('claimId') === id) ownedLockRef = lockRef;
      }
      tx.update(ref,{state,memberRespondedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      tx.create(auditRef(id),{actorUserId:identity.uid,event:'member_'+decision+'_invitation',at:FieldValue.serverTimestamp()});
      if (ownedLockRef) tx.delete(ownedLockRef);
    });
    return {state:decision === 'accept'?'uploader_confirmed':'rejected'};
  });

  const appealCreditClaim = onCall({ region:'europe-west2' }, async request => {
    const identity = await requireActive(request);
    await requireAgeVerified(identity.uid);
    const input = (request.data ?? {}) as Record<string,unknown>;
    const id = requireInput(input.claimId,'claim');
    const reason = clean(input.reason,600);
    if (reason.length < 10) throw new HttpsError('invalid-argument','Explain the appeal in at least 10 characters.');
    const ref = creditRef(id);
    await getFirestore().runTransaction(async tx => {
      const snap = await tx.get(ref), data = snap.data();
      if (!data || data.claimantUserId !== identity.uid) throw new HttpsError('permission-denied','Only the credited member can appeal.');
      if (!['rejected','revoked'].includes(data.state)) throw new HttpsError('failed-precondition','Only rejected or revoked claims can be appealed.');
      if (data.appealPending === true) throw new HttpsError('already-exists','An appeal is already awaiting review.');
      tx.update(ref,{appealPending:true,appealReason:reason,appealedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      tx.create(auditRef(id),{actorUserId:identity.uid,event:'member_appeal',reason,at:FieldValue.serverTimestamp()});
    });
    return {appealPending:true};
  });

  const listMyCreditClaims = onCall({ region:'europe-west2' }, async request => {
    const identity = await requireActive(request);
    await requireAgeVerified(identity.uid);
    const db = getFirestore();
    const input = (request.data ?? {}) as Record<string,unknown>;
    const cursor = clean(input.cursor,160);
    if (cursor && (cursor.includes('/') || !/^[A-Za-z0-9_-]+$/.test(cursor))) throw new HttpsError('invalid-argument','Invalid credit cursor.');
    // Separate claimant/uploader streams keep each query scoped to the caller.
    // Fetch one extra row from each stream to detect whether another page exists.
    const scoped = (field:'claimantUserId'|'uploaderUserId') => {
      let query = db.collection('verifiedCreditClaims').where(field,'==',identity.uid).orderBy('createdAt','desc').limit(51);
      return query;
    };
    // Cursor is an opaque claim ID; require that it belongs to this caller.
    let after: FirebaseFirestore.DocumentSnapshot | null = null;
    if (cursor) {
      const snap = await creditRef(cursor).get();
      if (!snap.exists || !snap.get('createdAt') ||
          (snap.get('claimantUserId') !== identity.uid && snap.get('uploaderUserId') !== identity.uid)) {
        throw new HttpsError('invalid-argument','Credit cursor is unavailable.');
      }
      after = snap;
    }
    const [mine,uploads] = await Promise.all([
      (after ? scoped('claimantUserId').startAfter(after) : scoped('claimantUserId')).get(),
      (after ? scoped('uploaderUserId').startAfter(after) : scoped('uploaderUserId')).get(),
    ]);
    const unique = new Map([...mine.docs,...uploads.docs].map(doc => [doc.id,doc]));
    const ordered = [...unique.values()].sort((a,b) =>
      (b.get('createdAt')?.toMillis?.() ?? 0) - (a.get('createdAt')?.toMillis?.() ?? 0) || b.id.localeCompare(a.id));
    const page = ordered.slice(0,50);
    return {claims:page.map(doc=>output(doc.id,doc.data())),nextCursor:ordered.length>50 ? page[page.length-1].id : null};
  });

  const adminListCreditClaims = onCall({ region:'europe-west2' }, async request => {
    const admin = requireAdmin(request);
    await requireAgeVerified(admin.uid);
    const input = (request.data ?? {}) as Record<string,unknown>;
    const cursor = clean(input.cursor,160);
    const db = getFirestore();
    let query = db.collection('verifiedCreditClaims').orderBy('createdAt','desc').limit(51);
    if (cursor) {
      if (cursor.includes('/')) throw new HttpsError('invalid-argument','Invalid queue cursor.');
      const previous = await db.collection('verifiedCreditClaims').doc(cursor).get();
      if (!previous.exists || !previous.get('createdAt')) throw new HttpsError('invalid-argument','Queue cursor has expired.');
      query = query.startAfter(previous);
    }
    const snapshot = await query.get();
    const page = snapshot.docs.slice(0,50);
    return {claims:page.map(doc=>output(doc.id,doc.data())),nextCursor:snapshot.docs.length>50 ? page[page.length-1].id : null};
  });

  return {claimMyReleaseCredit,inviteCreditedContributor,respondToCreditInvitation,respondToCreditClaim,adminReviewCreditClaim,appealCreditClaim,listMyCreditClaims,adminListCreditClaims};
}
