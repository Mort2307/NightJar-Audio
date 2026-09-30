import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase-client';

const communityCall = httpsCallable<{ releaseId: string }, { comments: any[]; reactions: { likes:number; loves:number; total:number; myReaction:string|null } }>(functions, 'releaseCommunity');
const commentCall = httpsCallable<{ releaseId: string; body: string }, { comment: any }>(functions, 'submitReleaseComment');
const deleteCommentCall = httpsCallable<{ commentId: string }, { deleted: boolean; commentId: string }>(functions, 'deleteMyReleaseComment');
const reactionCall = httpsCallable<{ releaseId: string; reaction: 'like' | 'love' | '' }, { comments: any[]; reactions: { likes:number; loves:number; total:number; myReaction:string|null } }>(functions, 'setReleaseReaction');
const reportCommentCall = httpsCallable<{ commentId: string; reason?: string }, { reported: boolean; commentId: string }>(functions, 'reportReleaseComment');
const adminCommentsCall = httpsCallable<void, { comments: any[] }>(functions, 'adminListCommentReports');
const adminModerateCommentCall = httpsCallable<{ commentId:string; decision:'keep'|'remove' }, { comment:any }>(functions, 'adminModerateReleaseComment');

export const nightjarCommunityEngagement = {
  async release(releaseId: string) {
    return (await communityCall({ releaseId })).data;
  },
  async comment(releaseId: string, body: string) {
    return (await commentCall({ releaseId, body })).data;
  },
  async deleteComment(commentId: string) {
    return (await deleteCommentCall({ commentId })).data;
  },
  async react(releaseId: string, reaction: 'like' | 'love' | '') {
    return (await reactionCall({ releaseId, reaction })).data;
  },
  async reportComment(commentId: string, reason = '') {
    return (await reportCommentCall({ commentId, reason })).data;
  },
  async adminQueue() {
    return (await adminCommentsCall()).data;
  },
  async moderateComment(commentId: string, decision: 'keep' | 'remove') {
    return (await adminModerateCommentCall({ commentId, decision })).data;
  },
};
