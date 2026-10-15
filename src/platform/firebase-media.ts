import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

type ImageKind = 'profile_avatar' | 'profile_banner' | 'brand_logo' | 'release_artwork' | 'script_artwork' | 'artist_portfolio' | 'social_avatar';

const submitImageCall = httpsCallable<{
  kind: ImageKind;
  targetId?: string;
  dataUrl: string;
  contentType: string;
  fileName?: string;
}, { assetId: string; status: string }>(functions, 'submitImageAsset');

const listPendingCall = httpsCallable<void, { assets: any[] }>(functions, 'listPendingImages');
const pendingPreviewCall = httpsCallable<{ assetId: string }, { assetId: string; contentType: string; dataUrl: string }>(functions, 'getPendingImagePreview');
const moderateCall = httpsCallable<{ assetId: string; decision: 'approved' | 'rejected'; note?: string; safetyConfirmed?: boolean }, { assetId: string; status: string; publicUrl?: string | null }>(functions, 'moderateImageAsset');
const statusCall = httpsCallable<{ assetId: string }, { assetId: string; status: string; publicUrl: string | null; moderationNote: string | null }>(functions, 'getImageAssetStatus');
const removeOwnedImageCall = httpsCallable<{ assetId: string }, { removed: boolean; assetId: string }>(functions, 'removeOwnedImageAsset');
const removeAvatarCall = httpsCallable<void, { removed: boolean }>(functions, 'removeProfileAvatar');
const removeBannerCall = httpsCallable<void, { removed: boolean }>(functions, 'removeProfileBanner');
const brandingCall = httpsCallable<void, { logoUrl: string | null; logoStatus: string | null; installIconsReady: boolean; iconVersion: number | null }>(functions, 'getBranding');
const syncBrandIconsCall = httpsCallable<{
  icon192DataUrl: string;
  icon512DataUrl: string;
  maskable512DataUrl: string;
}, { updated: boolean; version: number }>(functions, 'syncBrandIconVariants');
const removeBrandLogoCall = httpsCallable<void, { removed: boolean }>(functions, 'removeBrandLogo');

export const nightjarMedia = {
  async submitImage(input: { kind: ImageKind; targetId?: string; dataUrl: string; contentType: string; fileName?: string }) {
    return (await submitImageCall(input)).data;
  },

  async listPending() {
    return (await listPendingCall()).data;
  },

  async pendingPreview(assetId: string) {
    return (await pendingPreviewCall({ assetId })).data;
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

  async removeProfileBanner() {
    return (await removeBannerCall()).data;
  },

  async getBranding() {
    return (await brandingCall()).data;
  },

  async syncBrandIcons(input: { icon192DataUrl: string; icon512DataUrl: string; maskable512DataUrl: string }) {
    return (await syncBrandIconsCall(input)).data;
  },

  async removeBrandLogo() {
    return (await removeBrandLogoCall()).data;
  },
};
