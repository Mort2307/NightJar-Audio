import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

type Identity = { uid: string; admin: boolean };
type Request = { auth?: { uid: string; token: Record<string,unknown> } | null };
type FeedbackStatus = 'new' | 'triaged' | 'in_progress' | 'fixed' | 'closed';
const statuses = new Set<FeedbackStatus>(['new','triaged','in_progress','fixed','closed']);
const qaIds = new Set(['age','existing_verified','legal','credits_member','credits_invitation',
  'credits_confirmation','credits_admin','credits_appeals','official_moon',
  'credited_listener','connections','navigation','notifications','push',
  'listening','professional','cross_device','payment_provider','legal_signoff']);
const qualityStates = new Set(['pass','fail','blocked','not_verified']);
const clean = (value:unknown,max=500) => String(value??'').trim().slice(0,max);
const stamp = (value:any):string|null => value?.toDate?.()?.toISOString?.() ?? null;
const feedbackOutput = (doc:FirebaseFirestore.QueryDocumentSnapshot|FirebaseFirestore.DocumentSnapshot) => {
  const data=doc.data()??{};
  return {id:doc.id,category:data.category??'other',route:data.route??'/settings',details:data.details??'',
    status:data.status??'new',createdAt:stamp(data.createdAt),updatedAt:stamp(data.updatedAt),
    triageNote:data.triageNote??null};
};

/** Zero new services: account-locked Cloud Functions, private Firestore and manual human QA. */
export const buildNightjarQualityCallables = (
  requireActive:(request:Request)=>Promise<Identity>,
  requireAdmin:(request:Request)=>Identity,
  requireAgeVerified:(uid:string)=>Promise<unknown>,
) => {
  const db=getFirestore();

  const submitTesterFeedback=onCall({region:'europe-west2'},async request=>{
    const identity=await requireActive(request);
    await requireAgeVerified(identity.uid);
    const input=(request.data??{}) as Record<string,unknown>;
    const category=clean(input.category,32);
    if(!['bug','usability','feature','accessibility','other'].includes(category))
      throw new HttpsError('invalid-argument','Choose a feedback category.');
    const details=clean(input.details,2500);
    if(details.length<20) throw new HttpsError('invalid-argument','Describe the issue or suggestion in at least 20 characters.');
    const route=clean(input.route,160);
    if(!/^\/(?:discover|library|creators|creator|writer|editor|artist|messages|admin|profile|settings|calendar|protection)(?:\/[a-zA-Z0-9_-]{1,55})?$/.test(route))
      throw new HttpsError('invalid-argument','Invalid Nightjar page context.');
    const now=new Date();
    const day=now.toISOString().slice(0,10);
    const limiter=db.collection('nightjarFeedbackDailyLimits').doc(identity.uid);
    const feedback=db.collection('nightjarTesterFeedback').doc();
    await db.runTransaction(async tx=>{
      const state=await tx.get(limiter);
      const count=state.get('day')===day ? Number(state.get('count')??0) : 0;
      if(count>=5) throw new HttpsError('resource-exhausted','You have reached today’s feedback limit. Try again tomorrow.');
      tx.set(limiter,{day,count:count+1,updatedAt:FieldValue.serverTimestamp()});
      tx.create(feedback,{memberUserId:identity.uid,category,route,details,status:'new',
        createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    });
    return {submitted:true,reference:feedback.id};
  });

  const adminListTesterFeedback=onCall({region:'europe-west2'},async request=>{
    const identity=requireAdmin(request);
    await requireAgeVerified(identity.uid);
    const items=await db.collection('nightjarTesterFeedback').orderBy('createdAt','desc').limit(75).get();
    return {feedback:items.docs.map(feedbackOutput),hasMore:items.size===75};
  });

  const adminReviewTesterFeedback=onCall({region:'europe-west2'},async request=>{
    const identity=requireAdmin(request);
    await requireAgeVerified(identity.uid);
    const input=(request.data??{}) as Record<string,unknown>;
    const id=clean(input.id,90),status=clean(input.status,30) as FeedbackStatus;
    const note=clean(input.note,500);
    if(!/^[a-zA-Z0-9_-]{10,90}$/.test(id)||!statuses.has(status))
      throw new HttpsError('invalid-argument','Invalid feedback update.');
    if((status==='closed'||status==='fixed')&&note.length<12)
      throw new HttpsError('invalid-argument','Include the fix or closure reason.');
    const ref=db.collection('nightjarTesterFeedback').doc(id);
    await db.runTransaction(async tx=>{
      const item=await tx.get(ref);
      if(!item.exists) throw new HttpsError('not-found','Feedback not found.');
      tx.update(ref,{status,triageNote:note,updatedAt:FieldValue.serverTimestamp(),
        lastReviewedBy:identity.uid});
      tx.create(ref.collection('audit').doc(),{actorUserId:identity.uid,status,note,at:FieldValue.serverTimestamp()});
    });
    return {updated:true,status};
  });

  const adminGetQualityAcceptance=onCall({region:'europe-west2'},async request=>{
    const identity=requireAdmin(request);
    await requireAgeVerified(identity.uid);
    const snap=await db.collection('nightjarReleaseQuality').doc('acceptance-v1').get();
    const data=snap.data()??{};
    const stored=(data.checks??{}) as Record<string,any>;
    const checks=Object.fromEntries([...qaIds].map(id=>[id,{
      status:qualityStates.has(String(stored[id]?.status))?stored[id].status:'not_verified',
      evidence:clean(stored[id]?.evidence,500),
      updatedAt:stamp(stored[id]?.updatedAt),reviewer:clean(stored[id]?.reviewer,160)||null,
    }]));
    return {checks};
  });

  const adminRecordQualityCheck=onCall({region:'europe-west2'},async request=>{
    const identity=requireAdmin(request);
    await requireAgeVerified(identity.uid);
    const input=(request.data??{}) as Record<string,unknown>;
    const checkId=clean(input.checkId,45),status=clean(input.status,30);
    const evidence=clean(input.evidence,500);
    if(!qaIds.has(checkId)||!qualityStates.has(status))
      throw new HttpsError('invalid-argument','Unknown quality check or result.');
    if(status==='pass'&&evidence.length<20)
      throw new HttpsError('invalid-argument','Record at least 20 characters of observed evidence to mark a PASS.');
    const ref=db.collection('nightjarReleaseQuality').doc('acceptance-v1');
    await db.runTransaction(async tx=>{
      await tx.get(ref);
      const record={status,evidence,reviewer:identity.uid,updatedAt:FieldValue.serverTimestamp()};
      tx.set(ref,{checks:{[checkId]:record},updatedAt:FieldValue.serverTimestamp()},{merge:true});
      tx.create(ref.collection('audit').doc(),{checkId,...record});
    });
    return {saved:true,checkId,status};
  });

  return {submitTesterFeedback,adminListTesterFeedback,adminReviewTesterFeedback,
    adminGetQualityAcceptance,adminRecordQualityCheck};
};
