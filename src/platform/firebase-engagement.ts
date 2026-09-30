import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const stateCall = httpsCallable<void, { lovedReleaseIds: string[] }>(functions, 'releaseEngagementState');
const detailCall = httpsCallable<{ releaseId: string }, { releaseId: string; loveCount: number; commentCount: number; loved: boolean; viewerRole: string | null; comments: any[] }>(functions, 'listReleaseEngagement');
const loveCall = httpsCallable<{ releaseId: string; loved: boolean }, { releaseId: string; loved: boolean; loveCount: number }>(functions, 'setReleaseLove');
const commentCall = httpsCallable<{ releaseId: string; body: string }, { comment: any; commentCount: number }>(functions, 'addReleaseComment');
const deleteCommentCall = httpsCallable<{ releaseId: string; commentId: string }, { deleted: boolean; commentCount: number }>(functions, 'deleteReleaseComment');
const adminCommentsCall = httpsCallable<void, { comments: any[] }>(functions, 'adminListReleaseComments');
const adminStatusCall = httpsCallable<{ releaseId: string; commentId: string; status: 'visible' | 'hidden' }, { status: string; commentCount: number }>(functions, 'adminSetReleaseCommentStatus');

export const nightjarEngagement = {
  async state() {
    return (await stateCall()).data;
  },
  async detail(releaseId: string) {
    return (await detailCall({ releaseId })).data;
  },
  async setLove(releaseId: string, loved: boolean) {
    return (await loveCall({ releaseId, loved })).data;
  },
  async addComment(releaseId: string, body: string) {
    return (await commentCall({ releaseId, body })).data;
  },
  async deleteComment(releaseId: string, commentId: string) {
    return (await deleteCommentCall({ releaseId, commentId })).data;
  },
  async adminComments() {
    return (await adminCommentsCall()).data;
  },
  async adminSetCommentStatus(releaseId: string, commentId: string, status: 'visible' | 'hidden') {
    return (await adminStatusCall({ releaseId, commentId, status })).data;
  },
};
