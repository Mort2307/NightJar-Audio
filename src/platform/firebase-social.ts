import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const communityCall = httpsCallable<{ releaseId: string }, { loveCount:number; lovedByMe:boolean; comments:any[]; canInteract:boolean }>(functions, 'releaseCommunity');
const loveCall = httpsCallable<{ releaseId:string; loved:boolean }, { releaseId:string; loved:boolean; loveCount:number }>(functions, 'setReleaseLove');
const commentCall = httpsCallable<{ releaseId:string; body:string }, { comment:any }>(functions, 'postReleaseComment');
const deleteCommentCall = httpsCallable<{ commentId:string }, { deleted:boolean; commentId:string }>(functions, 'deleteOwnReleaseComment');
const reportCommentCall = httpsCallable<{ commentId:string; reason?:string }, { reported:boolean; reportId:string }>(functions, 'reportReleaseComment');
const adminReportsCall = httpsCallable<void, { reports:any[] }>(functions, 'adminListCommunityReports');
const adminResolveCall = httpsCallable<{ reportId:string; decision:'dismiss'|'remove' }, { reportId:string; decision:string }>(functions, 'adminResolveCommunityReport');

export const nightjarSocial = {
  async community(releaseId:string) {
    return (await communityCall({ releaseId })).data;
  },
  async love(releaseId:string, loved:boolean) {
    return (await loveCall({ releaseId, loved })).data;
  },
  async comment(releaseId:string, body:string) {
    return (await commentCall({ releaseId, body })).data;
  },
  async deleteComment(commentId:string) {
    return (await deleteCommentCall({ commentId })).data;
  },
  async reportComment(commentId:string, reason='') {
    return (await reportCommentCall({ commentId, reason })).data;
  },
  async adminReports() {
    return (await adminReportsCall()).data;
  },
  async adminResolve(reportId:string, decision:'dismiss'|'remove') {
    return (await adminResolveCall({ reportId, decision })).data;
  },
};
