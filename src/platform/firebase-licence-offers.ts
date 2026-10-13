import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp,'europe-west2');
export type ScriptLicenceOffer = {
  id:string;scriptId:string;scriptTitle:string;writerUserId:string;creatorUserId:string;
  amountPence:number;currency:'GBP';licenceType:'exclusive'|'non-exclusive';termMonths:number;
  permittedUse:string;usageDetails:string;status:string;lastProposerUserId:string;revision:number;
  paymentStatus:'not_collected';licenceGranted:false;updatedAt:string|null;createdAt:string|null;
};
export type ScriptLicenceTerms = { amountPence:number;licenceType:'exclusive'|'non-exclusive';termMonths:number;usageDetails:string };
const createCall=httpsCallable<ScriptLicenceTerms&{scriptId:string},{offer:ScriptLicenceOffer}>(functions,'createScriptLicenceOffer');
const listCall=httpsCallable<void,{offers:ScriptLicenceOffer[]}>(functions,'listMyScriptLicenceOffers');
const respondCall=httpsCallable<{offerId:string;action:'accept'|'decline'|'counter'|'withdraw'}&Partial<ScriptLicenceTerms>,{offer:ScriptLicenceOffer}>(functions,'respondScriptLicenceOffer');
export const nightjarLicenceOffers={
  async create(scriptId:string,terms:ScriptLicenceTerms){return (await createCall({scriptId,...terms})).data;},
  async list(){return (await listCall()).data;},
  async respond(offerId:string,action:'accept'|'decline'|'counter'|'withdraw',terms?:ScriptLicenceTerms){
    return (await respondCall({offerId,action,...(terms??{})})).data;
  },
};
