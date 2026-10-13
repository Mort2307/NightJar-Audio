import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';
const functions = getFunctions(firebaseApp,'europe-west2');

export type CommunityUpdate = { id:string; title:string; body:string; createdAt:string|null; test:boolean };
export type CommunityUpdateDelivery = { id:string; status:string; duplicate?:boolean; eligible:number; inboxCreated:number; errors:number; optedOut:number };
export type CommunityUpdateSummary = { id:string; title:string; audience:'self'|'all'; status:string; createdAt:string|null; outcome?:CommunityUpdateDelivery };

const publishCall=httpsCallable<{
 title:string;body:string;audience:'self'|'all';requestId:string;testVerified:boolean;
},CommunityUpdateDelivery>(functions,'adminPublishCommunityUpdate');
const getCall=httpsCallable<{id:string},CommunityUpdate>(functions,'getCommunityUpdate');
const listCall=httpsCallable<void,{updates:CommunityUpdateSummary[]}>(functions,'adminListCommunityUpdates');

export const communityUpdates={
 async publish(input:{title:string;body:string;audience:'self'|'all';requestId:string;testVerified:boolean}){
  return (await publishCall(input)).data;
 },
 async get(id:string){return (await getCall({id})).data;},
 async history(){return (await listCall()).data;},
};
