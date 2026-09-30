import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase-client';

const communityCall = httpsCallable<{ releaseId: string }, { comments: any[]; reactions: { likes:number; loves:number; total:number; myReaction:string|null }; canInteract?:boolean }>(functions, 'releaseCommunity');
const commentCall = httpsCallable<{ releaseId: string; body: string }, { comment: any }>(functions, 'postReleaseComment');
const deleteCommentCall = httpsCallable<{ commentId: string }, { deleted: boolean; commentId: string }>(functions, 'deleteOwnReleaseComment');
const reactionCall = httpsCallable<{ releaseId: string; reaction: 'like' | 'love' | '' }, { comments: any[]; reactions: { likes:number; loves:number; total:number; myReaction:string|null } }>(functions, 'setReleaseReaction');
const reportCommentCall = httpsCallable<{ commentId: string; reason?: string }, { reported: boolean; reportId?:string|null }>(functions, 'reportReleaseComment');

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
};
