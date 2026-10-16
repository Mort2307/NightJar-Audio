// End-to-end *callable handler* tests against a disposable Firestore emulator.
// Identity/age providers are injected in-memory, NEVER Didit or production auth.
// All release/claim records belong to demo-nightjar-credit-ci.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const requireFunctions=createRequire(new URL('../functions/package.json', import.meta.url));
const {initializeApp,deleteApp}=requireFunctions('firebase-admin/app');
const {getFirestore,Timestamp}=requireFunctions('firebase-admin/firestore');
const {HttpsError}=requireFunctions('firebase-functions/v2/https');
const {buildVerifiedCreditCallables}=requireFunctions('./lib/verified-credits.js');
const project='demo-nightjar-credit-ci';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Refusing credit E2E tests outside disposable Firestore + Auth emulators.');
}
const app=initializeApp({projectId:project});
const db=getFirestore();
const uid={uploader:'uploader',member:'member',other:'other',admin:'independent-admin',stranger:'stranger',unverified:'not-age-verified'};
const permitted=new Set(Object.values(uid));
const verified=new Set(Object.values(uid).filter(id=>id!==uid.unverified));
const notifications=[];
const requireActive=async request=>{
  if (!request.auth?.uid || !permitted.has(request.auth.uid)) throw new HttpsError('unauthenticated','Sign in required.');
  return {uid:request.auth.uid,admin:request.auth.uid===uid.admin};
};
const requireAdmin=request=>{
  if (request.auth?.uid!==uid.admin) throw new HttpsError('permission-denied','Administrator required.');
  return {uid:uid.admin,admin:true};
};
const requireAge=async userId=>{
  if (!verified.has(userId)) throw new HttpsError('permission-denied','Adult verification required.');
};
const notify=async (userId,payload)=>{notifications.push({userId,...payload});};
const f=buildVerifiedCreditCallables(requireActive,requireAdmin,requireAge,notify,async()=>[uid.admin,uid.member]);
const call=(key,user,data={})=>f[key].run({auth:user?{uid:user,token:{}}:null,data});
const expectError=async (callable,uidValue,data,code)=>{
  await assert.rejects(call(callable,uidValue,data),error=>error?.code===code,
    callable+' for '+uidValue+' must reject with '+code);
};
const runId='ci'+Date.now();
const releaseId='release'+runId,slotId='slot-main';
const releaseRef=db.collection('releases').doc(releaseId);
const lockFor=(slot)=>db.collection('verifiedCreditLocks').doc(createHash('sha256').update([releaseId,slot].join('|')).digest('hex'));
const claimSnap=id=>db.collection('verifiedCreditClaims').doc(id).get();
const participants=[uid.uploader,uid.member,uid.other,uid.admin];
try {
  for(const id of participants) await db.collection('accounts').doc(id).set({status:'active',role:id===uid.admin?'admin':'listener'});
  await releaseRef.set({
    status:'released',creatorUserId:uid.uploader,
    contributors:[
      {slotId,role:'Writer',name:'Contributor One'},
      {slotId:'slot-2',role:'Cover Artist',name:'Contributor Two'},
      {slotId:'slot-3',role:'Voice Actor',name:'Contributor Three'},
      {slotId:'slot-4',role:'Audio Editor',name:'Contributor Four'},
    ],
  });

  // Claim cannot be forged by arbitrary party, unverified member or uploader.
  await expectError('claimMyReleaseCredit',null,{releaseId,contributorSlotId:slotId},'unauthenticated');
  await expectError('claimMyReleaseCredit',uid.unverified,{releaseId,contributorSlotId:slotId},'permission-denied');
  await expectError('claimMyReleaseCredit',uid.uploader,{releaseId,contributorSlotId:slotId},'failed-precondition');
  await expectError('inviteCreditedContributor',uid.member,{releaseId,contributorSlotId:slotId,invitedUserId:uid.other},'permission-denied');
  await expectError('inviteCreditedContributor',uid.uploader,{releaseId,contributorSlotId:slotId,invitedUserId:uid.uploader},'failed-precondition');

  // Uploader-controlled invitation requires explicit member acceptance.
  const invited=await call('inviteCreditedContributor',uid.uploader,{releaseId,contributorSlotId:slotId,invitedUserId:uid.member});
  assert.equal(invited.state,'awaiting_member');
  assert.equal((await claimSnap(invited.claimId)).get('source'),'uploader_invitation');
  assert.ok(notifications.some(n=>n.userId===uid.member&&n.claimId===invited.claimId&&n.route.includes('/profile?credits=')));
  await expectError('respondToCreditInvitation',uid.other,{claimId:invited.claimId,decision:'accept'},'permission-denied');
  await expectError('respondToCreditClaim',uid.uploader,{claimId:invited.claimId,decision:'confirm'},'failed-precondition');
  await expectError('getCreditClaim',uid.stranger,{claimId:invited.claimId},'permission-denied');
  assert.equal((await call('getCreditClaim',uid.member,{claimId:invited.claimId})).claim.id,invited.claimId);
  assert.equal((await call('getCreditClaim',uid.admin,{claimId:invited.claimId})).claim.state,'awaiting_member');
  await expectError('adminReviewCreditClaim',uid.uploader,{claimId:invited.claimId,decision:'approve'},'permission-denied');
  await expectError('adminReviewCreditClaim',uid.admin,{claimId:invited.claimId,decision:'approve'},'failed-precondition');

  assert.equal((await call('respondToCreditInvitation',uid.member,{claimId:invited.claimId,decision:'accept'})).state,'uploader_confirmed');
  await expectError('respondToCreditInvitation',uid.member,{claimId:invited.claimId,decision:'accept'},'failed-precondition');
  assert.ok(notifications.some(n=>n.userId===uid.admin&&n.claimId===invited.claimId&&n.subtype==='ready_for_review'));
  const approved=await call('adminReviewCreditClaim',uid.admin,{claimId:invited.claimId,decision:'approve'});
  assert.equal(approved.state,'approved');
  const snap=await claimSnap(invited.claimId);
  assert.equal(snap.get('approvedByAdminUserId'),uid.admin);
  assert.equal(snap.get('claimantUserId'),uid.member);
  assert.equal((await call('getCreditClaim',uid.uploader,{claimId:invited.claimId})).claim.state,'approved');
  await expectError('adminReviewCreditClaim',uid.admin,{claimId:invited.claimId,decision:'approve'},'failed-precondition');
  await expectError('claimMyReleaseCredit',uid.other,{releaseId,contributorSlotId:slotId},'already-exists');
  const audits=await db.collection('verifiedCreditClaims').doc(invited.claimId).collection('audit').get();
  const events=audits.docs.map(doc=>doc.get('event'));
  for(const event of ['uploader_invitation','member_accept_invitation','admin_approve'])assert.ok(events.includes(event),'Missing audit '+event);
  assert.ok(notifications.some(n=>n.userId===uid.member&&n.claimId===invited.claimId&&n.subtype==='admin_approve'));

  // Revocation must remove the lock and allow a new reviewed claimant.
  await expectError('adminReviewCreditClaim',uid.member,{claimId:invited.claimId,decision:'revoke',reason:'Revocation requested'},'permission-denied');
  assert.equal((await call('adminReviewCreditClaim',uid.admin,{claimId:invited.claimId,decision:'revoke',reason:'Correction requested'})).state,'revoked');
  assert.equal((await lockFor(slotId).get()).exists,false);
  await expectError('appealCreditClaim',uid.other,{claimId:invited.claimId,reason:'I should own this credit.'},'permission-denied');
  assert.equal((await call('appealCreditClaim',uid.member,{claimId:invited.claimId,reason:'The credit was valid.'})).appealPending,true);
  await expectError('appealCreditClaim',uid.member,{claimId:invited.claimId,reason:'Second simultaneous appeal'},'already-exists');
  assert.ok(notifications.some(n=>n.userId===uid.admin&&n.claimId===invited.claimId&&n.subtype==='appeal_requested'));
  assert.equal((await call('adminReviewCreditClaim',uid.admin,{claimId:invited.claimId,decision:'resolve_appeal',reason:'Decision upheld after evidence review.'})).state,'appeal_resolved');
  assert.equal((await claimSnap(invited.claimId)).get('appealPending'),false);

  // A separate member-originated claim needs uploader confirmation first.
  const claimed=await call('claimMyReleaseCredit',uid.other,{releaseId,contributorSlotId:slotId});
  assert.equal(claimed.state,'awaiting_uploader');
  await expectError('respondToCreditClaim',uid.member,{claimId:claimed.claimId,decision:'confirm'},'permission-denied');
  assert.equal((await call('respondToCreditClaim',uid.uploader,{claimId:claimed.claimId,decision:'dispute'})).state,'uploader_disputed');
  await expectError('adminReviewCreditClaim',uid.admin,{claimId:claimed.claimId,decision:'approve'},'failed-precondition');
  assert.equal((await call('adminReviewCreditClaim',uid.admin,{claimId:claimed.claimId,decision:'reject',reason:'Attribution disputed'})).state,'rejected');
  assert.equal((await lockFor(slotId).get()).exists,false);

  // Declining an invitation releases the slot for a new eligible member.
  const declined=await call('inviteCreditedContributor',uid.uploader,{releaseId,contributorSlotId:'slot-2',invitedUserId:uid.other});
  assert.equal((await call('respondToCreditInvitation',uid.other,{claimId:declined.claimId,decision:'decline'})).state,'rejected');
  assert.equal((await lockFor('slot-2').get()).exists,false);

  // Competing callable requests on the same slot must serialize atomically.
  const outcomes=await Promise.allSettled([
    call('claimMyReleaseCredit',uid.member,{releaseId,contributorSlotId:'slot-3'}),
    call('claimMyReleaseCredit',uid.other,{releaseId,contributorSlotId:'slot-3'}),
  ]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1,'Only one claimant may win the actual callable transaction');
  assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
  assert.equal((await lockFor('slot-3').get()).exists,true);

  // Member cannot see unrelated records in their queue; administrators can.
  const list=await call('listMyCreditClaims',uid.member);
  assert.ok(list.claims.some(c=>c.id===invited.claimId));
  assert.ok(!list.claims.some(c=>c.id===claimed.claimId));
  const adminList=await call('adminListCreditClaims',uid.admin);
  assert.ok(adminList.claims.some(c=>c.id===claimed.claimId));
  await expectError('adminListCreditClaims',uid.other,{},'permission-denied');

  // Fifty-plus items: stable pagination and direct lookup beyond the first page.
  const bulk=db.batch();
  const bulkIds=[];
  for(let i=0;i<57;i++){
    const id='historic-'+runId+'-'+String(i).padStart(3,'0');
    bulkIds.push(id);
    bulk.set(db.collection('verifiedCreditClaims').doc(id),{
      releaseId,contributorSlotId:'historic-'+i,claimantUserId:uid.member,
      uploaderUserId:uid.uploader,releaseRole:'Writer',creditName:'Legacy '+i,
      source:'member_claim',state:'rejected',
      createdAt:Timestamp.fromMillis(Date.now()+i*1000),
      updatedAt:Timestamp.fromMillis(Date.now()+i*1000),
    });
  }
  await bulk.commit();
  const first=await call('listMyCreditClaims',uid.member);
  assert.equal(first.claims.length,50);
  assert.ok(first.nextCursor);
  const second=await call('listMyCreditClaims',uid.member,{cursor:first.nextCursor});
  assert.ok(second.claims.length>=8,'The second page must include historical claims');
  const allIds=new Set([...first.claims,...second.claims].map(x=>x.id));
  assert.equal(allIds.size,first.claims.length+second.claims.length,'Paginated claims must not duplicate');
  const legacy=await call('getCreditClaim',uid.member,{claimId:bulkIds[0]});
  assert.equal(legacy.claim.id,bulkIds[0]);
  assert.ok(notifications.every(n=>n.type==='verified_credit'&&n.route.startsWith('/')),'Notifications must contain only app routes');
  console.log('PASS: REAL callable handlers exercised end to end on emulated Firestore: invitations, identity, 18+ gate, dispute, independence, approvals, appeals, revocation, contention, notifications, audit, pagination and exact historical lookup.');
} finally {
  await Promise.allSettled([db.terminate()]);
  await deleteApp(app);
}
