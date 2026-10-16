// Real Firebase emulators only. Uses a throwaway demo-* project and never
// contacts Didit, sends notifications, or touches the NightJar production DB.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {initializeApp as initializeClient, deleteApp as deleteClient} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInAnonymously,signOut} from 'firebase/auth';
import {getFirestore as getClientFirestore,connectFirestoreEmulator,doc,getDoc,setDoc,deleteDoc,terminate} from 'firebase/firestore';
const fromFunctions=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp:initializeAdminApp,deleteApp:deleteAdminApp}=fromFunctions('firebase-admin/app');
const {getFirestore:getAdminFirestore}=fromFunctions('firebase-admin/firestore');
const project='demo-nightjar-credit-ci';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Refusing to run outside Firebase Auth+Firestore emulators.');
}
const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
const app=initializeClient({apiKey:'demo-credits-test',projectId:project,authDomain:project+'.firebaseapp.com'},'credit-rules-test');
const auth=getAuth(app);
connectAuthEmulator(auth,'http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST,{disableWarnings:true});
const clientDb=getClientFirestore(app);
connectFirestoreEmulator(clientDb,host,Number(port));
const adminApp=initializeAdminApp({projectId:project},'credit-admin-test');
const adminDb=getAdminFirestore(adminApp);
const id='ci-test-'+Date.now();
const claimPath='verifiedCreditClaims/'+id;
try {
  await signInAnonymously(auth);
  const denied=async(label,operation)=>{
    await assert.rejects(operation,err=>err?.code==='permission-denied',label+' must be denied by Firestore rules');
  };
  await adminDb.doc(claimPath).set({state:'awaiting_member',claimantUserId:auth.currentUser.uid});
  await denied('claim read',getDoc(doc(clientDb,claimPath)));
  await denied('claim mutation',setDoc(doc(clientDb,claimPath),{state:'approved'}));
  await denied('credit lock write',setDoc(doc(clientDb,'verifiedCreditLocks/'+id),{claimId:id}));
  await denied('audit tampering',setDoc(doc(clientDb,claimPath+'/audit/hacked'),{event:'admin_approve'}));
  await denied('account notification injection',setDoc(doc(clientDb,'accounts/'+auth.currentUser.uid+'/notifications/'+id),{type:'verified_credit'}));
  await denied('credit deletion',deleteDoc(doc(clientDb,claimPath)));
  // Independently check genuine Firestore optimistic concurrency: simultaneous
  // attempts to acquire the same slot lock may never both succeed.
  const lock=adminDb.doc('verifiedCreditLocks/'+id);
  const take=uid=>adminDb.runTransaction(async tx=>{
    const current=await tx.get(lock);
    if (current.exists) throw new Error('already claimed');
    tx.create(lock,{claimId:uid});
    return uid;
  });
  const contenders=await Promise.allSettled([take('member-A'),take('member-B')]);
  assert.equal(contenders.filter(item=>item.status==='fulfilled').length,1,'Exactly one slot claimant succeeds');
  await signOut(auth);
  console.log('PASS: real Auth/Firestore emulator denied all unauthorised credit access and admitted only one concurrent slot claimant.');
} finally {
  await Promise.allSettled([terminate(clientDb),adminDb.terminate()]);
  await Promise.allSettled([deleteClient(app),deleteAdminApp(adminApp)]);
}
