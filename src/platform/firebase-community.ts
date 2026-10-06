import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

type Profile = Record<string, any>;

const getMyProfileCall = httpsCallable<{ role?: string }, { profile: Profile | null }>(functions, 'getMyProfile');
const saveMyProfileCall = httpsCallable<Profile, { profile: Profile | null }>(functions, 'saveMyProfile');
const listCreatorsCall = httpsCallable<void, { creators: any[] }>(functions, 'listCreators');
const listPublicProfilesCall = httpsCallable<void, { profiles: any[] }>(functions, 'listPublicProfiles');
const getCreatorProfileCall = httpsCallable<{ userId: string }, { creator: any }>(functions, 'getCreatorProfile');
const getPublicProfileCall = httpsCallable<{ userId: string }, { profile: any }>(functions, 'getPublicProfile');
const getMyProfilePortfolioOptionsCall = httpsCallable<{ role?: string }, { role: string; options: any[]; completedCollaborations: number }>(functions, 'getMyProfilePortfolioOptions');
const profileTagCatalogueCall = httpsCallable<void, { tags: string[] }>(functions, 'profileTagCatalogue');
const adminProfileTagCatalogueCall = httpsCallable<void, { tags: any[]; promotionThreshold: number }>(functions, 'adminProfileTagCatalogue');
const adminSetProfileTagStatusCall = httpsCallable<{ tagId: string; status: 'candidate' | 'promoted' | 'hidden' }, { tagId: string; status: string }>(functions, 'adminSetProfileTagStatus');
const listWritersCall = httpsCallable<void, { writers: any[] }>(functions, 'listWriters');
const spotlightStateCall = httpsCallable<void, { date: string; spotlights: any[]; listenerTopSevenCount: number; listenerSpotlightDay: number | null; listenerWeek: string | null }>(functions, 'spotlightState');
const communityStateCall = httpsCallable<void, { follows: { targetUserId?: string; creatorUserId?: string; targetRole?: string | null }[]; favourites: { releaseId: string }[] }>(functions, 'communityState');
const setCreatorFollowCall = httpsCallable<{ creatorUserId: string; following: boolean }, { creatorUserId: string; following: boolean }>(functions, 'setCreatorFollow');
const setProfileFollowCall = httpsCallable<{ targetUserId: string; following: boolean }, { targetUserId: string; targetRole: string | null; following: boolean }>(functions, 'setProfileFollow');
const setFavouriteReleaseCall = httpsCallable<{ releaseId: string; favourite: boolean }, { releaseId: string; favourite: boolean }>(functions, 'setFavouriteRelease');

export const nightjarCommunity = {
  async getMyProfile(role?: string) {
    return (await getMyProfileCall(role ? { role } : {})).data;
  },

  async saveMyProfile(profile: Profile) {
    return (await saveMyProfileCall(profile)).data;
  },

  async listCreators() {
    return (await listCreatorsCall()).data;
  },

  async listPublicProfiles() {
    return (await listPublicProfilesCall()).data;
  },

  async getCreatorProfile(userId: string) {
    return (await getCreatorProfileCall({ userId })).data;
  },

  async getPublicProfile(userId: string) {
    return (await getPublicProfileCall({ userId })).data;
  },

  async getMyProfilePortfolioOptions(role?: string) {
    return (await getMyProfilePortfolioOptionsCall(role ? { role } : {})).data;
  },

  async profileTagCatalogue() {
    return (await profileTagCatalogueCall()).data;
  },
  async adminProfileTagCatalogue() {
    return (await adminProfileTagCatalogueCall()).data;
  },
  async adminSetProfileTagStatus(tagId: string, status: 'candidate' | 'promoted' | 'hidden') {
    return (await adminSetProfileTagStatusCall({ tagId, status })).data;
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

  async setProfileFollow(targetUserId: string, following: boolean) {
    return (await setProfileFollowCall({ targetUserId, following })).data;
  },

  async setFavouriteRelease(releaseId: string, favourite: boolean) {
    return (await setFavouriteReleaseCall({ releaseId, favourite })).data;
  },
};
