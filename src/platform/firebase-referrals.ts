import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const suggestCall = httpsCallable<
  { creatorName:string; publicUrl?:string; note?:string },
  { suggestion:{ id:string; creatorName:string; publicUrl?:string|null; status:string; referralCode:string; recommendationPath:string } }
>(functions,'submitCreatorSuggestion');

const recommendCall = httpsCallable<
  { targetCreatorUserId:string },
  { path:string; code:string }
>(functions,'creatorRecommendationLink');

const listSuggestionsCall = httpsCallable<void,{ suggestions:any[] }>(functions,'listCreatorSuggestions');
const reviewSuggestionCall = httpsCallable<
  { suggestionId:string; status:'new'|'contacted'|'invited'|'joined'|'dismissed' },
  { suggestionId:string; status:string }
>(functions,'reviewCreatorSuggestion');

export const nightjarReferrals = {
  async suggestCreator(input:{ creatorName:string; publicUrl?:string; note?:string }) {
    return (await suggestCall(input)).data;
  },
  async recommendCreator(targetCreatorUserId:string) {
    return (await recommendCall({targetCreatorUserId})).data;
  },
  async adminSuggestions() {
    return (await listSuggestionsCall()).data;
  },
  async adminReviewSuggestion(suggestionId:string,status:'new'|'contacted'|'invited'|'joined'|'dismissed') {
    return (await reviewSuggestionCall({suggestionId,status})).data;
  },
};
