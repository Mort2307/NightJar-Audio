import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

type Profile = Record<string, any>;

const getMyProfileCall = httpsCallable<void, { profile: Profile | null }>(functions, 'getMyProfile');
const saveMyProfileCall = httpsCallable<Profile, { profile: Profile | null }>(functions, 'saveMyProfile');
const listCreatorsCall = httpsCallable<void, { creators: any[] }>(functions, 'listCreators');
const getCreatorProfileCall = httpsCallable<{ userId: string }, { creator: any }>(functions, 'getCreatorProfile');
const listWritersCall = httpsCallable<void, { writers: any[] }>(functions, 'listWriters');
const spotlightStateCall = httpsCallable<void, { date: string; spotlights: any[]; listenerTopSevenCount: number; listenerSpotlightDay: number | null; listenerWeek: string | null }>(functions, 'spotlightState');
const communityStateCall = httpsCallable<void, { follows: { creatorUserId: string }[]; favourites: { releaseId: string }[] }>(functions, 'communityState');
const setCreatorFollowCall = httpsCallable<{ creatorUserId: string; following: boolean }, { creatorUserId: string; following: boolean }>(functions, 'setCreatorFollow');
const setFavouriteReleaseCall = httpsCallable<{ releaseId: string; favourite: boolean }, { releaseId: string; favourite: boolean }>(functions, 'setFavouriteRelease');

export const nightjarCommunity = {
  async getMyProfile() {
    return (await getMyProfileCall()).data;
  },

  async saveMyProfile(profile: Profile) {
    return (await saveMyProfileCall(profile)).data;
  },

  async listCreators() {
    return (await listCreatorsCall()).data;
  },

  async getCreatorProfile(userId: string) {
    return (await getCreatorProfileCall({ userId })).data;
  },

  async listWriters() {
    return (await listWritersCall()).data;
  },

  async spotlightState() {
    return (await spotlightStateCall()).data;
  },

  async state() {
    return (await communityStateCall()).data;
  },

  async setCreatorFollow(creatorUserId: string, following: boolean) {
    return (await setCreatorFollowCall({ creatorUserId, following })).data;
  },

  async setFavouriteRelease(releaseId: string, favourite: boolean) {
    return (await setFavouriteReleaseCall({ releaseId, favourite })).data;
  },
};
