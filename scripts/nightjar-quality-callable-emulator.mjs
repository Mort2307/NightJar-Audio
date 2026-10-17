// Real Cloud Function handlers, disposable Auth + Firestore emulators only.
// Does not use live Didit, send email, invoke paid providers or deploy anything.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {initializeApp as clientApp,deleteApp as deleteClientApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInAnonymously} from 'firebase/auth';
import {getFirestore as clientFirestore,connectFirestoreEmulator,getDoc,doc,terminate} from 'firebase/firestore';
const fromFunctions=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=fromFunctions('firebase-admin/app');
const {getFirestore}=fromFunctions('firebase-admin/firestore');
const {HttpsError}=fromFunctions('firebase-functions/v2/https');
const {buildNightjarQualityCallables}=fromFunctions('./lib/nightjar-quality.js');
const project='demo-nightjar-quality-ci';
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error('Refusing quality-handler tests without isolated Auth and Firestore emulators.');
const serverApp=initializeApp({projectId:project});
const db=getFirestore();
const webApp=clientApp({projectId:project,apiKey:'demo-quality',authDomain:project+'.firebaseapp.com'},'quality-client');
const auth=getAuth(webApp);
connectAuthEmulator(auth,'http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST,{disableWarnings:true});
const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
const clientDb=clientFirestore(webApp);
connectFirestoreEmulator(clientDb,host,Number(port));
const ids={admin:'quality-owner',member:'quality-member',unverified:'quality-unverified'};
const requireActive=async request=>{
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','Sign in required');
  return {uid:request.auth.uid,admin:request.auth.uid===ids.admin};
};
const requireAdmin=request=>{
  if(request.auth?.uid!==ids.admin)throw new HttpsError('permission-denied','Admin required');
  return {uid:ids.admin,admin:true};
};
const requireAge=async id=>{
  if(id===ids.unverified)throw new HttpsError('permission-denied','Didit approval required');
};
const handlers=buildNightjarQualityCallables(requireActive,requireAdmin,requireAge);
const call=(name,id,data={})=>handlers[name].run({auth:id?{uid:id,token:{}}:null,data});
const denied=async(name,id,data,code)=>assert.rejects(call(name,id,data),e=>e?.code===code,name+' expected '+code);
try{
  await signInAnonymously(auth);
  await denied('submitTesterFeedback',null,{category:'bug',route:'/settings',details:'This text is long enough to submit.'},'unauthenticated');
  await denied('submitTesterFeedback',ids.unverified,{category:'bug',route:'/settings',details:'This text is long enough to submit.'},'permission-denied');
  await denied('submitTesterFeedback',ids.member,{category:'unknown',route:'/settings',details:'This text is long enough to submit.'},'invalid-argument');
  await denied('submitTesterFeedback',ids.member,{category:'bug',route:'https://outside.test',details:'This text is long enough to submit.'},'invalid-argument');
  await denied('adminGetQualityAcceptance',ids.member,{},'permission-denied');
  await denied('adminListTesterFeedback',ids.member,{},'permission-denied');
  await denied('adminRecordQualityCheck',ids.member,{checkId:'credits_member',status:'pass',evidence:'I verified this works on a real account.'},'permission-denied');
  await denied('adminRecordQualityCheck',ids.admin,{checkId:'credits_member',status:'pass',evidence:'looks good'},'invalid-argument');
  const items=[];
  for(let n=0;n<5;n++)items.push(await call('submitTesterFeedback',ids.member,{category:'usability',route:'/settings',
    details:'Tester cannot find the route on mobile step '+n+' and needs an improvement.'}));
  assert.ok(items.every(v=>v.submitted&&v.reference));
  await denied('submitTesterFeedback',ids.member,{category:'bug',route:'/settings',details:'Sixth feedback item over daily limit.'},'resource-exhausted');
  const list=await call('adminListTesterFeedback',ids.admin);
  assert.ok(list.feedback.some(item=>item.id===items[0].reference));
  await denied('adminReviewTesterFeedback',ids.member,{id:items[0].reference,status:'closed',note:'A resolution was done.'},'permission-denied');
  await denied('adminReviewTesterFeedback',ids.admin,{id:items[0].reference,status:'fixed',note:'short'},'invalid-argument');
  const reviewed=await call('adminReviewTesterFeedback',ids.admin,{id:items[0].reference,status:'fixed',note:'Fixed the navigation entry in the You page.'});
  assert.equal(reviewed.updated,true);
  const snap=await db.collection('nightjarTesterFeedback').doc(items[0].reference).get();
  assert.equal(snap.get('status'),'fixed');
  assert.equal((await snap.ref.collection('audit').get()).size,1);
  const initial=await call('adminGetQualityAcceptance',ids.admin);
  assert.equal(initial.checks.credits_member.status,'not_verified');
  const result=await call('adminRecordQualityCheck',ids.admin,{
    checkId:'credits_member',status:'pass',evidence:'Android device + desktop: claim and uploader confirmation observed in an approved test.'});
  assert.equal(result.status,'pass');
  const checks=await call('adminGetQualityAcceptance',ids.admin);
  assert.equal(checks.checks.credits_member.status,'pass');
  assert.equal(checks.checks.credits_invitation.status,'not_verified');
  assert.equal((await db.collection('nightjarReleaseQuality').doc('acceptance-v1').collection('audit').get()).size,1);
  // Firestore remains all-client-deny, even after sign-in.
  await assert.rejects(getDoc(doc(clientDb,'nightjarTesterFeedback',items[0].reference)),
    err=>err?.code==='permission-denied','Member SDK cannot read private feedback collection');
  console.log('PASS: real emulated NightJar Quality handlers: account and 18+ gate, bounded intake, admin-only triage, audited outcomes, real evidence and client Firestore denial.');
}finally{
  await Promise.allSettled([terminate(clientDb),db.terminate()]);
  await Promise.allSettled([deleteClientApp(webApp),deleteApp(serverApp)]);
}
