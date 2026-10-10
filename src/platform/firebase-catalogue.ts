import { getFunctions, httpsCallable } from 'firebase/functions';
import { deleteObject, getStorage, ref, uploadBytes } from 'firebase/storage';
import { firebaseApp, firebaseAuth } from './firebase-auth';
import { repairMojibakeDisplayData } from './text-integrity';

const functions = getFunctions(firebaseApp, 'europe-west2');
const storage = getStorage(firebaseApp);

const listCatalogueCall = httpsCallable<{ q?: string; category?: string }, { catalogue: any[] }>(functions, 'listCatalogue');
const createReleaseCall = httpsCallable<Record<string, unknown>, { release: any }>(functions, 'createRelease');
const updateReleaseCall = httpsCallable<Record<string, unknown>, { release: any }>(functions, 'updateRelease');
const deleteReleaseCall = httpsCallable<{ releaseId: string }, { deleted: boolean }>(functions, 'deleteRelease');
const finalizeAudioCall = httpsCallable<{ releaseId: string; storagePath: string; durationMinutes?: number | null }, { release: any }>(functions, 'finalizeReleaseAudio');
const removeAudioCall = httpsCallable<{ releaseId: string }, { removed: boolean }>(functions, 'removeReleaseAudio');
const submitReleaseCall = httpsCallable<{ releaseId: string }, { release: any }>(functions, 'submitReleaseForModeration');
const dashboardCall = httpsCallable<{ creatorUserId?: string }, { releases: any[]; metrics: any }>(functions, 'creatorDashboard');
const playbackCall = httpsCallable<{ releaseId: string }, { releaseId: string; url: string; expiresInSeconds: number; accessReason: 'admin' | 'credited_work' | 'subscription' }>(functions, 'getReleasePlaybackUrl');
const transcriptCall = httpsCallable<{ releaseId: string }, {
  releaseId: string;
  title: string;
  transcript: string;
  language: string;
  wordCount: number;
  accessibilityReviewed: boolean;
  accessReason: 'admin' | 'credited_work' | 'subscription';
}>(functions, 'getReleaseTranscript');
const moderationQueueCall = httpsCallable<void, { releases: any[] }>(functions, 'releaseModerationQueue');
const adminPreviewCall = httpsCallable<{ releaseId: string }, { releaseId: string; url: string; expiresInSeconds: number }>(functions, 'getAdminReleasePreviewUrl');
const moderateReleaseCall = httpsCallable<{ releaseId: string; decision: 'approved' | 'changes' | 'rejected'; note?: string; nightjarOriginal?: boolean }, { release: any }>(functions, 'moderateRelease');
const recommendationsCall = httpsCallable<{ intent?: string }, { recommendations: any[]; model: any }>(functions, 'recommendations');
const trendingCall = httpsCallable<void, { trending: any[] }>(functions, 'trendingReleases');

export const nightjarCatalogue = {
  async list(q = '', category = '') {
    return repairMojibakeDisplayData((await listCatalogueCall({ q, category })).data);
  },

  async create(input: Record<string, unknown>) {
    return (await createReleaseCall(input)).data;
  },

  async update(releaseId: string, input: Record<string, unknown>) {
    return (await updateReleaseCall({ ...input, releaseId })).data;
  },

  async remove(releaseId: string) {
    return (await deleteReleaseCall({ releaseId })).data;
  },

  async uploadAudio(releaseId: string, file: File, durationMinutes?: number | null) {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('auth/no-current-user');
    const storagePath = `release-audio/${user.uid}/${releaseId}/${crypto.randomUUID()}`;
    const fileRef = ref(storage, storagePath);
    await uploadBytes(fileRef, file, { contentType: file.type, cacheControl: 'private,no-store,max-age=0' });
    try {
      return (await finalizeAudioCall({ releaseId, storagePath, durationMinutes })).data;
    } catch (error) {
      try { await deleteObject(fileRef); } catch { /* backend validation is authoritative */ }
      throw error;
    }
  },

  async removeAudio(releaseId: string) {
    return (await removeAudioCall({ releaseId })).data;
  },

  async submit(releaseId: string) {
    return (await submitReleaseCall({ releaseId })).data;
  },

  async dashboard(creatorUserId?: string) {
    return repairMojibakeDisplayData((await dashboardCall(creatorUserId ? { creatorUserId } : {})).data);
  },

  async playback(releaseId: string) {
    return (await playbackCall({ releaseId })).data;
  },

  async transcript(releaseId: string) {
    return (await transcriptCall({ releaseId })).data;
  },

  async moderationQueue() {
    return repairMojibakeDisplayData((await moderationQueueCall()).data);
  },

  async adminPreview(releaseId: string) {
    return (await adminPreviewCall({ releaseId })).data;
  },

  async moderate(releaseId: string, decision: 'approved' | 'changes' | 'rejected', note?: string, nightjarOriginal = false) {
    return (await moderateReleaseCall({ releaseId, decision, note, nightjarOriginal })).data;
  },

  async recommendations(intent = '') {
    return repairMojibakeDisplayData((await recommendationsCall(intent ? { intent } : {})).data);
  },

  async trending() {
    return repairMojibakeDisplayData((await trendingCall()).data);
  },
};
