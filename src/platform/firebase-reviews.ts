import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const submitCall = httpsCallable<{ releaseId: string; rating: number; review?: string }, { review: any }>(functions, 'submitReleaseReview');
const listCall = httpsCallable<{ releaseId: string }, { reviews: any[]; averageRating: number | null; ratingCount: number; myReview: any | null }>(functions, 'listReleaseReviews');
const adminQueueCall = httpsCallable<void, { reviews: any[] }>(functions, 'adminListReviewQueue');
const moderateCall = httpsCallable<{ reviewId: string; decision: 'approved' | 'rejected' }, { review: any }>(functions, 'adminModerateReview');

export const nightjarReviews = {
  async submit(releaseId: string, rating: number, review = '') {
    return (await submitCall({ releaseId, rating, review })).data;
  },

  async list(releaseId: string) {
    return (await listCall({ releaseId })).data;
  },

  async adminQueue() {
    return (await adminQueueCall()).data;
  },

  async moderate(reviewId: string, decision: 'approved' | 'rejected') {
    return (await moderateCall({ reviewId, decision })).data;
  },
};
