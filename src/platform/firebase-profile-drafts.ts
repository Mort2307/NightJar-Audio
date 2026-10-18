import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

export type StudioDraftScope = 'form-editor-showcase' | 'form-artist-portfolio';
export type ProfileDraftScope='onboarding'|'profile-listener'|'profile-creator'|'profile-writer'|'profile-editor'|'profile-artist'|'profile-admin'|StudioDraftScope;
export type CloudProfileDraft={
  scope:ProfileDraftScope;
  revision:number;
  payload:Record<string,unknown>|null;
  updatedAt:string|null;
};
export type SavedCloudProfileDraft=CloudProfileDraft&{saved:boolean};
const functions=getFunctions(firebaseApp,'europe-west2');
const getCall=httpsCallable<{scope:ProfileDraftScope},CloudProfileDraft>(functions,'getMyProfileWorkingDraft');
const saveCall=httpsCallable<{scope:ProfileDraftScope;payload:Record<string,unknown>;expectedRevision:number},SavedCloudProfileDraft>(functions,'saveMyProfileWorkingDraft');
const clearCall=httpsCallable<{scope:ProfileDraftScope;expectedRevision:number},{cleared:boolean;revision:number}>(functions,'clearMyProfileWorkingDraft');

export const nightjarProfileDrafts={
  async get(scope:ProfileDraftScope){return (await getCall({scope})).data;},
  async save(scope:ProfileDraftScope,payload:Record<string,unknown>,expectedRevision:number){
    return (await saveCall({scope,payload,expectedRevision})).data;
  },
  async clear(scope:ProfileDraftScope,expectedRevision:number){
    return (await clearCall({scope,expectedRevision})).data;
  },
};
