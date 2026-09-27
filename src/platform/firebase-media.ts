import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

type ImageKind = 'profile_avatar' | 'brand_logo' | 'release_artwork';

const submitImageCall = httpsCallable<{
  kind: ImageKind;
  targetId?: string;
  dataUrl: string;
  contentType: string;
  fileName?: string;
}, { assetId: string; status: string }>(functions, 'submitImageAsset');

const listPendingCall = httpsCallable<void, { assets: any[] }>(functions, 'listPendingImages');
const moderateCall = httpsCallable<{ assetId: string; decision: 'approved' | 'rejected'; note?: string; safetyConfirmed?: boolean }, { assetId: string; status: string; publicUrl?: string | null }>(functions, 'moderateImageAsset');
const statusCall = httpsCallable<{ assetId: string }, { assetId: string; status: string; publicUrl: string | null; moderationNote: string | null }>(functions, 'getImageAssetStatus');
const removeOwnedImageCall = httpsCallable<{ assetId: string }, { removed: boolean; assetId: string }>(functions, 'removeOwnedImageAsset');
const removeAvatarCall = httpsCallable<void, { removed: boolean }>(functions, 'removeProfileAvatar');
const brandingCall = httpsCallable<void, { logoUrl: string | null; logoStatus: string | null }>(functions, 'getBranding');
const removeBrandLogoCall = httpsCallable<void, { removed: boolean }>(functions, 'removeBrandLogo');

export const nightjarMedia = {
  async submitImage(input: { kind: ImageKind; targetId?: string; dataUrl: string; contentType: string; fileName?: string }) {
    return (await submitImageCall(input)).data;
  },

  async listPending() {
    return (await listPendingCall()).data;
  },

  async moderate(assetId: string, decision: 'approved' | 'rejected', note?: string, safetyConfirmed = false) {
    return (await moderateCall({ assetId, decision, note, safetyConfirmed })).data;
  },

  async status(assetId: string) {
    return (await statusCall({ assetId })).data;
  },

  async removeOwnedImage(assetId: string) {
    return (await removeOwnedImageCall({ assetId })).data;
  },

  async removeProfileAvatar() {
    return (await removeAvatarCall()).data;
  },

  async getBranding() {
    return (await brandingCall()).data;
  },

  async removeBrandLogo() {
    return (await removeBrandLogoCall()).data;
  },
};
