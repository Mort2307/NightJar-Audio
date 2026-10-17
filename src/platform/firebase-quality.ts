import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions=getFunctions(firebaseApp,'europe-west2');
export type FeedbackKind='bug'|'usability'|'feature'|'accessibility'|'other';
export type FeedbackStatus='new'|'triaged'|'in_progress'|'fixed'|'closed';
export type TesterFeedback={
  id:string;category:FeedbackKind;route:string;details:string;status:FeedbackStatus;
  createdAt:string|null;updatedAt:string|null;triageNote:string|null;
};
export type QualityStatus='pass'|'fail'|'blocked'|'not_verified';
export type QualityCheck={status:QualityStatus;evidence:string;updatedAt:string|null;reviewer:string|null};
const send=httpsCallable<{category:FeedbackKind;route:string;details:string},{submitted:boolean;reference:string}>(functions,'submitTesterFeedback');
const queue=httpsCallable<void,{feedback:TesterFeedback[];hasMore:boolean}>(functions,'adminListTesterFeedback');
const review=httpsCallable<{id:string;status:FeedbackStatus;note:string},{updated:boolean;status:FeedbackStatus}>(functions,'adminReviewTesterFeedback');
const acceptance=httpsCallable<void,{checks:Record<string,QualityCheck>}>(functions,'adminGetQualityAcceptance');
const saveCheck=httpsCallable<{checkId:string;status:QualityStatus;evidence:string},{saved:boolean;checkId:string;status:QualityStatus}>(functions,'adminRecordQualityCheck');
export const nightjarQuality={
  async send(category:FeedbackKind,route:string,details:string){return(await send({category,route,details})).data;},
  async queue(){return(await queue()).data;},
  async review(id:string,status:FeedbackStatus,note:string){return(await review({id,status,note})).data;},
  async checks(){return(await acceptance()).data.checks;},
  async record(checkId:string,status:QualityStatus,evidence:string){return(await saveCheck({checkId,status,evidence})).data;},
};
