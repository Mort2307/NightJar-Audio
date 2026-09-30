import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type ReleaseReaction = 'like' | 'love' | null;

const stateCall = httpsCallable<void, { reactions: { releaseId: string; reaction: Exclude<ReleaseReaction, null> }[] }>(functions, 'releaseReactionState');
const communityCall = httpsCallable<{ releaseId: string }, {
  comments: any[];
  reactions: { likes: number; loves: number; total: number; myReaction: ReleaseReaction };
}>(functions, 'releaseCommunity');
const reactionCall = httpsCallable<{ releaseId: string; reaction: ReleaseReaction }, {
  comments: any[];
  reactions: { likes: number; loves: number; total: number; myReaction: ReleaseReaction };
}>(functions, 'setReleaseReaction');
const commentCall = httpsCallable<{ releaseId: string; body: string }, { comment: any }>(functions, 'postReleaseComment');
const deleteCommentCall = httpsCallable<{ commentId: string }, { deleted: boolean; commentId: string }>(functions, 'deleteOwnReleaseComment');
const reportCommentCall = httpsCallable<{ commentId: string; reason?: string }, { reported: boolean; commentId: string }>(functions, 'reportReleaseComment');

export const nightjarEngagement = {
  async state() {
    return (await stateCall()).data;
  },
  async community(releaseId: string) {
    return (await communityCall({ releaseId })).data;
  },
  async setReaction(releaseId: string, reaction: ReleaseReaction) {
    return (await reactionCall({ releaseId, reaction })).data;
  },
  async comment(releaseId: string, body: string) {
    return (await commentCall({ releaseId, body })).data;
  },
  async deleteComment(commentId: string) {
    return (await deleteCommentCall({ commentId })).data;
  },
  async reportComment(commentId: string, reason = '') {
    return (await reportCommentCall({ commentId, reason })).data;
  },
  async adminReports() {
    const data = (await adminReportsCall()).data;
    return { reports:(data.reports ?? []).filter((item:any) => item.type === 'release_comment') };
  },
  async moderateCommentReport(reportId: string, decision: 'dismiss' | 'remove') {
    return (await adminModerateCall({ reportId, decision })).data;
  },
};
