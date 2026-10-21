import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';
import { repairMojibakeDisplayData } from './text-integrity';

const functions = getFunctions(firebaseApp, 'europe-west2');

type Profile = Record<string, any>;

const getMyProfileCall = httpsCallable<void, { profile: Profile | null }>(functions, 'getMyProfile');
const pauseOnboardingCall = httpsCallable<{draft:Profile;stepIndex:number;revision:number;dismiss:boolean},{dismissed:boolean;completed:boolean;revision:number}>(functions,'pauseProfileOnboarding');
const saveMyProfileCall = httpsCallable<Profile, { profile: Profile | null }>(functions, 'saveMyProfile');
export type ApprovedProfileFraming = {assetId:string;mode:'fit'|'fill';zoom:number;x:number;y:number};
const saveApprovedProfileFramingCall = httpsCallable<ApprovedProfileFraming & {kind:'avatar'|'banner'},{kind:'avatar'|'banner';framing:ApprovedProfileFraming}>(functions,'saveApprovedProfileFraming');
const deferMyProfileOnboardingCall = httpsCallable<void, { deferred: boolean }>(functions, 'deferMyProfileOnboarding');
const listCreatorsCall = httpsCallable<void, { creators: any[] }>(functions, 'listCreators');
const listPublicProfilesCall = httpsCallable<void, { profiles: any[] }>(functions, 'listPublicProfiles');
const getCreatorProfileCall = httpsCallable<{ userId: string }, { creator: any }>(functions, 'getCreatorProfile');
const getPublicProfileCall = httpsCallable<{ userId: string }, { profile: any }>(functions, 'getPublicProfile');
const getMyProfilePortfolioOptionsCall = httpsCallable<{ profileRole?: string }, { role: string; options: any[]; completedCollaborations: number }>(functions, 'getMyProfilePortfolioOptions');
const profileTagCatalogueCall = httpsCallable<void, { tags: string[] }>(functions, 'profileTagCatalogue');
const adminProfileTagCatalogueCall = httpsCallable<void, { tags: any[]; promotionThreshold: number }>(functions, 'adminProfileTagCatalogue');
const adminSetProfileTagStatusCall = httpsCallable<{ tagId: string; status: 'candidate' | 'promoted' | 'hidden' }, { tagId: string; status: string }>(functions, 'adminSetProfileTagStatus');
const listWritersCall = httpsCallable<void, { writers: any[] }>(functions, 'listWriters');
const spotlightStateCall = httpsCallable<void, { date: string; spotlights: any[]; listenerTopSevenCount: number; listenerSpotlightDay: number | null; listenerWeek: string | null }>(functions, 'spotlightState');
const communityStateCall = httpsCallable<void, { follows: { targetUserId?: string; creatorUserId?: string; targetRole?: string | null }[]; favourites: { releaseId: string }[] }>(functions, 'communityState');
const setCreatorFollowCall = httpsCallable<{ creatorUserId: string; following: boolean }, { creatorUserId: string; following: boolean }>(functions, 'setCreatorFollow');
const setProfileFollowCall = httpsCallable<{ targetUserId: string; following: boolean }, { targetUserId: string; targetRole: string | null; following: boolean }>(functions, 'setProfileFollow');
export type PublicConnection = { userId:string; name:string; handle?:string|null; avatarUrl?:string|null; initials?:string|null; role:string; official:boolean };
export type PublicConnectionResult = { userId:string; kind:'followers'|'following'; people:PublicConnection[]; sampled:number; hasMore:boolean; publicOnly:true };
const listPublicProfileConnectionsCall = httpsCallable<{ userId:string;kind:'followers'|'following' }, PublicConnectionResult>(functions,'listPublicProfileConnections');
const setFavouriteReleaseCall = httpsCallable<{ releaseId: string; favourite: boolean }, { releaseId: string; favourite: boolean }>(functions, 'setFavouriteRelease');

export const nightjarCommunity = {
  async getMyProfile() {
    return repairMojibakeDisplayData((await getMyProfileCall()).data);
  },

  async pauseOnboarding(draft: Profile, stepIndex: number, revision: number) {
    return (await pauseOnboardingCall({draft,stepIndex,revision,dismiss:true})).data;
  },
  async saveOnboardingDraft(draft: Profile, stepIndex: number, revision: number) {
    return (await pauseOnboardingCall({draft,stepIndex,revision,dismiss:false})).data;
  },

  async saveMyProfile(profile: Profile, profileRole?: string) {
    return (await saveMyProfileCall({ ...profile, ...(profileRole ? { profileRole } : {}) })).data;
  },

  async saveApprovedProfileFraming(kind:'avatar'|'banner',framing:ApprovedProfileFraming) {
    return (await saveApprovedProfileFramingCall({...framing,kind})).data;
  },

  async deferMyProfileOnboarding() {
    return (await deferMyProfileOnboardingCall()).data;
  },

  async listCreators() {
    return repairMojibakeDisplayData((await listCreatorsCall()).data);
  },

  async listPublicProfiles() {
    return repairMojibakeDisplayData((await listPublicProfilesCall()).data);
  },

  async getCreatorProfile(userId: string) {
    return repairMojibakeDisplayData((await getCreatorProfileCall({ userId })).data);
  },

  async getPublicProfile(userId: string) {
    return repairMojibakeDisplayData((await getPublicProfileCall({ userId })).data);
  },

  async getMyProfilePortfolioOptions(profileRole?: string) {
    return repairMojibakeDisplayData((await getMyProfilePortfolioOptionsCall(profileRole ? { profileRole } : {})).data);
  },

  async profileTagCatalogue() {
    return repairMojibakeDisplayData((await profileTagCatalogueCall()).data);
  },
  async adminProfileTagCatalogue() {
    return repairMojibakeDisplayData((await adminProfileTagCatalogueCall()).data);
  },
  async adminSetProfileTagStatus(tagId: string, status: 'candidate' | 'promoted' | 'hidden') {
    return (await adminSetProfileTagStatusCall({ tagId, status })).data;
  },

  async listWriters() {
    return repairMojibakeDisplayData((await listWritersCall()).data);
  },

  async spotlightState() {
    return repairMojibakeDisplayData((await spotlightStateCall()).data);
  },

  async state() {
    return (await communityStateCall()).data;
  },

  async setCreatorFollow(creatorUserId: string, following: boolean) {
    return (await setCreatorFollowCall({ creatorUserId, following })).data;
  },

  async listPublicProfileConnections(userId:string, kind:'followers'|'following') {
    return repairMojibakeDisplayData((await listPublicProfileConnectionsCall({ userId, kind })).data);
  },

  async setProfileFollow(targetUserId: string, following: boolean) {
    return (await setProfileFollowCall({ targetUserId, following })).data;
  },

  async setFavouriteRelease(releaseId: string, favourite: boolean) {
    return (await setFavouriteReleaseCall({ releaseId, favourite })).data;
  },
};
