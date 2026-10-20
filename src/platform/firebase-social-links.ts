import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

export type NightjarSocialLink = {
  id:string;
  url:string;
  platform:string;
  photoUrl:string|null;
  photoStatus:'approved'|'pending'|'rejected'|null;
  pendingPhotoAssetId?:string|null;
  photoCleanupPending?:boolean;
};
const functions=getFunctions(firebaseApp,'europe-west2');
const listCall=httpsCallable<void,{links:NightjarSocialLink[];cleanupLinkIds:string[]}>(functions,'listMySocialLinks');
const saveCall=httpsCallable<{id?:string;url:string},{link:NightjarSocialLink}>(functions,'saveMySocialLink');
const deleteCall=httpsCallable<{id:string},{deleted:boolean;pendingCleanup:boolean}>(functions,'deleteMySocialLink');
const retryCleanupCall=httpsCallable<{id:string},{pendingCleanup:boolean}>(functions,'retryMySocialPhotoCleanup');

export const nightjarSocialLinks={
  async list(){return (await listCall()).data.links??[];},
  async listWithCleanup(){return (await listCall()).data;},
  async retryCleanup(id:string){return (await retryCleanupCall({id})).data;},
  async save(url:string,id?:string){return (await saveCall({url,...(id?{id}:{})})).data.link;},
  async remove(id:string){return (await deleteCall({id})).data.deleted;},
  async removeWithCleanup(id:string){return (await deleteCall({id})).data;},
};
