// Publication and follower alerts for all eligible Nightjar members.
// Public, moderated content only. Never send private draft details to devices.
// An idempotent per-account notification document prevents duplicate alerts
// across Firestore event retries, follow subscriptions and normal broadcasts.
import { createHash } from 'node:crypto';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';

const REGION='europe-west2';
const db=()=>getFirestore();
type PublicationKind='audio'|'script'|'artwork';
const clean=(value:unknown,max=150)=>String(value??'').trim().slice(0,max);
const idFor=(key:string)=>'public-'+createHash('sha256').update(key).digest('hex').slice(0,40);
const pathFor=(value:string)=>encodeURIComponent(value);
const prefsFor=(value:Record<string,any>)=>value.notificationPreferences??{};
const contentPreference:Record<PublicationKind,string>={
  audio:'newReleases', script:'newScripts', artwork:'newArtwork',
};
const contentName:Record<PublicationKind,string>={
  audio:'audio',script:'script',artwork:'artwork',
};
const callableTitle=(name:string,kind:PublicationKind,following:boolean)=>
  following ? name+' has published new '+contentName[kind] : 'New '+contentName[kind]+' on NightJar';
const safeProfileName=(data:Record<string,any>)=>
  clean(data.displayName||data.name||data.handle,70)||'A NightJar creator';
const isPublicScript=(data:Record<string,any>|undefined)=>{
  const listing=data?.marketplace??{};
  return !!data && ['Approved','Published'].includes(String(data.status??''))
    && listing.visibility==='marketplace' && Boolean(clean(listing.synopsis,1800));
};
const isPublished=(kind:PublicationKind,data:Record<string,any>|undefined)=>{
  if(!data)return false;
  if(kind==='audio')return data.status==='released';
  if(kind==='script')return isPublicScript(data);
  return data.status==='published' && data.imageStatus==='approved'
    && Boolean(clean(data.imageUrl,500));
};
const destination=(kind:PublicationKind,id:string,ownerId:string)=>{
  if(kind==='audio')return '/discover?release='+pathFor(id);
  if(kind==='script')return '/discover?script='+pathFor(id);
  return '/people/'+pathFor(ownerId)+'?role=artist&artwork='+pathFor(id);
};
const userEligible=(account:Record<string,any>|undefined)=>
  Boolean(account) && account?.status==='active' && account?.disabled!==true;

// A notification's durable record always exists independently of device push.
// A user's previously saved preference applies to both the inbox and phone.
// Generic wording remains the default on adult-content lock screens.
const sendMemberUpdate=async(uid:string,account:Record<string,any>,input:{
  kind:'content'|'follow';category?:PublicationKind;itemId:string;
  ownerId:string;title:string;description:string;route:string;
  authorName:string;following?:boolean;
})=>{
  const prefs=prefsFor(account);
  if(input.kind==='content'){
    if(prefs[contentPreference[input.category??'audio']]===false)return false;
  }else if(prefs.newFollowers===false)return false;
  const key=input.kind==='follow'?'new-follower:'+input.itemId+':'+uid
    :'public-'+input.category+':'+input.itemId;
  const ref=db().collection('accounts').doc(uid).collection('notifications').doc(idFor(key));
  const mode=['full','discreet','minimal'].includes(String(prefs.displayMode??''))
    ? String(prefs.displayMode):'discreet';
  const title=mode==='full'?input.title:mode==='minimal'?'NightJar':'NightJar update';
  const message=mode==='full'?input.description:mode==='minimal'?'You have a new NightJar notification.':'New activity is available in NightJar.';
  const payload={
    type:input.kind==='follow'?'follow':'content',
    subtype:input.kind==='follow'?'new_follower':'new_'+input.category,
    contentKind:input.category??null, itemId:input.itemId,
    creatorUserId:input.ownerId, followingCreator:input.following===true,
    title,message,route:input.route,read:false,
    createdAt:FieldValue.serverTimestamp(),
  };
  try{await ref.create(payload);}
  catch(error:any){
    if(Number(error?.code)===6||error?.code==='already-exists')return false;
    throw error;
  }
  // Up to 20 devices per member, consistent with existing NightJar push.
  const devices=await db().collection('accounts').doc(uid).collection('pushDevices').where('active','==',true).limit(20).get();
  const targets=devices.docs.filter(d=>clean(d.data().token,4096).length>31);
  if(!targets.length)return true;
  try {
    const delivered=await getMessaging().sendEachForMulticast({
      tokens:targets.map(d=>String(d.data().token)),
      data:{
        type:payload.type,subtype:payload.subtype,
        title,body:message,route:input.route,notificationId:ref.id,
      },
      webpush:{headers:{Urgency:'normal'}},
    });
    await Promise.allSettled(delivered.responses.map(async(result,index)=>{
      const device=targets[index];
      if(!device)return;
      const code=result.error?.code??'messaging/unknown-error';
      await device.ref.set(result.success?{
        lastDeliveredAt:FieldValue.serverTimestamp(),lastError:null,
      }:{
        lastFailedAt:FieldValue.serverTimestamp(),lastError:code,
        active:!['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(code),
      },{merge:true});
    }));
  }catch(error){
    console.warn('NightJar publication notification: device delivery failed',uid,error instanceof Error?error.message:String(error));
  }
  return true;
};

const broadcastPublication=async(kind:PublicationKind,id:string,data:Record<string,any>)=>{
  const ownerId=clean(kind==='audio'?data.creatorUserId:kind==='script'?data.writerUserId:data.ownerUserId,170);
  if(!ownerId)return;
  const ownerAccount=await db().collection('accounts').doc(ownerId).get();
  if(!userEligible(ownerAccount.data()))return;
  const profile=await db().collection('profiles').doc(ownerId).get();
  // Artist portfolio is available only through an approved public Artist profile.
  if(kind==='artwork' && (!profile.exists || profile.data()?.publicProfile===false))return;
  const authorName=safeProfileName(profile.data()??{});
  const itemTitle=clean(data.title,140)||('Untitled '+contentName[kind]);
  const route=destination(kind,id,ownerId);
  let last:any=null;
  let recipients=0;
  // Page through *all* registered accounts; a fixed .limit(500) would silently
  // stop delivering when NightJar grows. Bound concurrency to contain costs.
  do {
    let query=db().collection('accounts').orderBy('__name__').limit(100);
    if(last)query=query.startAfter(last);
    const page=await query.get();
    if(page.empty)break;
    for(let i=0;i<page.docs.length;i+=20){
      const slice=page.docs.slice(i,i+20);
      const results=await Promise.allSettled(slice.map(async member=>{
        const account=member.data();
        if(member.id===ownerId||!userEligible(account))return;
        if(prefsFor(account)[contentPreference[kind]]===false)return;
        const isFollowing=(await member.ref.collection('follows').doc(ownerId).get()).exists;
        const title=callableTitle(authorName,kind,isFollowing);
        const description=isFollowing
          ? authorName+' has just made '+itemTitle+' available on NightJar ('+contentName[kind]+'). Tap to open.'
          : 'New '+contentName[kind]+' is available on NightJar: '+itemTitle+'. Tap to open.';
        if(await sendMemberUpdate(member.id,account,{
          kind:'content',category:kind,itemId:id,ownerId,title,description,route,authorName,following:isFollowing,
        }))recipients++;
      }));
      for(const result of results)if(result.status==='rejected')
        console.error('NightJar content notification recipient failed',kind,id,String(result.reason));
    }
    last=page.docs[page.docs.length-1];
    if(page.size<100)break;
  }while(true);
  console.info('NightJar published content notification fanout',{kind,id,recipients});
};

const publicNotificationTrigger=(kind:PublicationKind,collection:string)=>
  onDocumentWritten({document:collection+'/{itemId}',region:REGION,memory:'512MiB',timeoutSeconds:540},async event=>{
    const previous=event.data?.before.data() as Record<string,any>|undefined;
    const current=event.data?.after.data() as Record<string,any>|undefined;
    if(!isPublished(kind,current)||isPublished(kind,previous))return;
    // Existing, already-public material should not receive a second broadcast
    // just because it is edited or re-approved.
    await broadcastPublication(kind,String(event.params.itemId),current!);
  });
export const notifyPublishedAudio=publicNotificationTrigger('audio','releases');
export const notifyPublishedScript=publicNotificationTrigger('script','scripts');
export const notifyPublishedArtwork=publicNotificationTrigger('artwork','artistPortfolio');

// Firestore trigger runs only for a real new follow relationship. Failed or
// repeated calls to setProfileFollow cannot manufacture another follower alert.
export const notifyNewFollower=onDocumentCreated({
  document:'accounts/{followerId}/follows/{followedId}',region:REGION,
},async event=>{
  const followerId=String(event.params.followerId);
  const followedId=String(event.params.followedId);
  if(!followerId||!followedId||followerId===followedId)return;
  const [follower,account,profile]=await Promise.all([
    db().collection('accounts').doc(followerId).get(),
    db().collection('accounts').doc(followedId).get(),
    db().collection('profiles').doc(followerId).get(),
  ]);
  if(!userEligible(follower.data())||!userEligible(account.data()))return;
  const publiclyVisible=profile.exists && profile.data()?.publicProfile!==false;
  const authorName=publiclyVisible?safeProfileName(profile.data()??{}):'A NightJar member';
  await sendMemberUpdate(followedId,account.data()??{},{
    kind:'follow',itemId:followerId,ownerId:followerId,authorName,
    title:'You have a new follower',
    description:publiclyVisible?authorName+' started following you on NightJar. Tap to view their profile.':'Someone new started following you on NightJar.',
    route:publiclyVisible?'/people/'+pathFor(followerId):'/creators',
  });
});
