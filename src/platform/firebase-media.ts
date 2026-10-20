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
const removeOwnedImageCall = httpsCallable<{ assetId: string }, { removed: boolean; assetId: string; pendingCleanup: boolean }>(functions, 'removeOwnedImageAsset');
const removeAvatarCall = httpsCallable<void, { removed: boolean; pendingCleanup: boolean }>(functions, 'removeProfileAvatar');
const removeBannerCall = httpsCallable<void, { removed: boolean; pendingCleanup: boolean }>(functions, 'removeProfileBanner');
type BrandingInfo = { logoUrl: string | null; logoStatus: string | null; installIconsReady: boolean; iconVersion: number | null; iconCleanupPending: boolean; logoCleanupPending: boolean };
const brandingCall = httpsCallable<void, BrandingInfo>(functions, 'getBranding');

// Cache ONLY public branding metadata; never cache protected artwork, moderation,
// account data, verification decisions or signed resources.
const BRANDING_CACHE_MS = 90_000;
let brandingCache: { value: BrandingInfo; until: number } | null = null;
let brandingRequest: Promise<BrandingInfo> | null = null;
let brandingGeneration = 0;
const invalidateBranding = () => {
  brandingGeneration += 1;
  brandingCache = null;
  brandingRequest = null;
};
const announceBrandingChange = () => {
  invalidateBranding();
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('nightjar:branding-changed'));
  try { window.localStorage.setItem('nightjar.branding.version', String(Date.now())); } catch { /* Private mode may block storage. */ }
};
if (typeof window !== 'undefined') {
  window.addEventListener('nightjar:branding-changed', invalidateBranding);
  window.addEventListener('storage', event => {
    if (event.key === 'nightjar.branding.version') invalidateBranding();
  });
}
const syncBrandIconsCall = httpsCallable<{
  icon192DataUrl: string;
  icon512DataUrl: string;
  maskable512DataUrl: string;
}, { updated: boolean; version: number; pendingCleanup: boolean }>(functions, 'syncBrandIconVariants');
const retryBrandIconCleanupCall = httpsCallable<void, { pendingCleanup: boolean }>(functions, 'retryBrandIconCleanup');
const removeBrandLogoCall = httpsCallable<void, { removed: boolean; pendingCleanup: boolean }>(functions, 'removeBrandLogo');
const retryBrandLogoCleanupCall = httpsCallable<void, { pendingCleanup: boolean }>(functions, 'retryBrandLogoCleanup');

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
    const result = (await moderateCall({ assetId, decision, note, safetyConfirmed })).data;
    announceBrandingChange();
    return result;
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

  async getBranding(forceRefresh = false): Promise<BrandingInfo> {
    if (forceRefresh) invalidateBranding();
    if (brandingCache && brandingCache.until > Date.now()) return brandingCache.value;
    if (brandingRequest) return brandingRequest;
    const generation = brandingGeneration;
    const pending = brandingCall().then(response => {
      if (generation === brandingGeneration) {
        brandingCache = { value: response.data, until: Date.now() + BRANDING_CACHE_MS };
      }
      return response.data;
    });
    brandingRequest = pending;
    try { return await pending; }
    finally { if (brandingRequest === pending) brandingRequest = null; }
  },

  async syncBrandIcons(input: { icon192DataUrl: string; icon512DataUrl: string; maskable512DataUrl: string }) {
    const result = (await syncBrandIconsCall(input)).data;
    announceBrandingChange();
    return result;
  },

  async retryBrandIconCleanup() {
    const result = (await retryBrandIconCleanupCall()).data;
    announceBrandingChange();
    return result;
  },

  async retryBrandLogoCleanup() {
    const result = (await retryBrandLogoCleanupCall()).data;
    announceBrandingChange();
    return result;
  },

  async removeBrandLogo() {
    const result = (await removeBrandLogoCall()).data;
    announceBrandingChange();
    return result;
  },
};
