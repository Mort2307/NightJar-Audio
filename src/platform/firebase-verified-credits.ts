import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');
export type CreditClaim = {
  id: string;
  releaseId: string;
  contributorSlotId: string;
  claimantUserId: string;
  uploaderUserId: string;
  releaseRole: string;
  state: 'awaiting_uploader' | 'uploader_confirmed' | 'uploader_disputed' | 'uploader_unsure' | 'admin_review' | 'approved' | 'rejected' | 'revoked';
  source: string;
  appealPending?: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};
const mine = httpsCallable<{cursor?:string},{claims:CreditClaim[];nextCursor:string|null}>(functions,'listMyCreditClaims');
const admin = httpsCallable<{cursor?:string},{claims:CreditClaim[];nextCursor:string|null}>(functions,'adminListCreditClaims');
const claim = httpsCallable<{releaseId:string;contributorSlotId:string},{claimId:string;state:string}>(functions,'claimMyReleaseCredit');
const respond = httpsCallable<{claimId:string;decision:'confirm'|'dispute'|'unsure'},{state:string}>(functions,'respondToCreditClaim');
const appeal = httpsCallable<{claimId:string;reason:string},{appealPending:boolean}>(functions,'appealCreditClaim');
const review = httpsCallable<{claimId:string;decision:'approve'|'reject'|'revoke'|'resolve_appeal';reason?:string},{state:string}>(functions,'adminReviewCreditClaim');

export const verifiedCreditApi = {
  async myClaims(cursor?:string) { return (await mine({cursor})).data; },
  async adminClaims(cursor?:string) { return (await admin({cursor})).data; },
  async claim(releaseId:string,contributorSlotId:string) { return (await claim({releaseId,contributorSlotId})).data; },
  async uploaderResponse(claimId:string,decision:'confirm'|'dispute'|'unsure') { return (await respond({claimId,decision})).data; },
  async appeal(claimId:string,reason:string) { return (await appeal({claimId,reason})).data; },
  async adminDecision(claimId:string,decision:'approve'|'reject'|'revoke'|'resolve_appeal',reason?:string) { return (await review({claimId,decision,reason})).data; },
};
