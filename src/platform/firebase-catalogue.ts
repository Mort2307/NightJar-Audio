import { getFunctions, httpsCallable } from 'firebase/functions';
import { deleteObject, getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { firebaseApp, firebaseAuth } from './firebase-auth';
import { nightjarAudioContentType, nightjarAudioFileProblem, nightjarAudioUploadFailure } from './audio-upload';
import { repairMojibakeDisplayData } from './text-integrity';

const functions = getFunctions(firebaseApp, 'europe-west2');
const storage = getStorage(firebaseApp);

const listCatalogueCall = httpsCallable<{ q?: string; category?: string }, { catalogue: any[] }>(functions, 'listCatalogue');
const createReleaseCall = httpsCallable<Record<string, unknown>, { release: any }>(functions, 'createRelease');
const updateReleaseCall = httpsCallable<Record<string, unknown>, { release: any }>(functions, 'updateRelease');
const deleteReleaseCall = httpsCallable<{ releaseId: string }, { deleted: boolean }>(functions, 'deleteRelease');
const adminRemoveReleaseCall = httpsCallable<{ releaseId: string }, { deleted: boolean }>(functions, 'adminRemoveRelease');
const finalizeAudioCall = httpsCallable<{ releaseId: string; storagePath: string; durationMinutes?: number | null }, { release: any }>(functions, 'finalizeReleaseAudio');
const removeAudioCall = httpsCallable<{ releaseId: string }, { removed: boolean }>(functions, 'removeReleaseAudio');
const submitReleaseCall = httpsCallable<{ releaseId: string }, { release: any }>(functions, 'submitReleaseForModeration');
const dashboardCall = httpsCallable<{ creatorUserId?: string }, { releases: any[]; metrics: any }>(functions, 'creatorDashboard');
const listenCountsCall = httpsCallable<void, { counts: { releaseId: string; listens: number }[]; refreshedAt: string }>(functions, 'getReleaseListenCounts');
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
const audioLibraryCall = httpsCallable<void, { releases: any[]; totalInspected: number; truncated: boolean }>(functions, 'adminReleaseAudioLibrary');
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

  async adminRemove(releaseId: string) {
    return (await adminRemoveReleaseCall({ releaseId })).data;
  },

  async uploadAudio(releaseId: string, file: File, durationMinutes?: number | null, onProgress?: (stage: 'uploading' | 'verifying', percent: number) => void) {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('auth/no-current-user');
    const storagePath = `release-audio/${user.uid}/${releaseId}/${crypto.randomUUID()}`;
    const maxMiB = 25;
    const problem = nightjarAudioFileProblem(file, maxMiB);
    if (problem) throw new Error(problem);
    const contentType = nightjarAudioContentType(file)!;
    const fileRef = ref(storage, storagePath);
    try {
      onProgress?.('uploading', 0);
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(fileRef, file, { contentType, cacheControl: 'private,no-store,max-age=0' });
        task.on('state_changed', (snapshot) => {
          const percent = snapshot.totalBytes > 0 ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0;
          onProgress?.('uploading', percent);
        }, reject, () => resolve());
      });
      onProgress?.('verifying', 100);
    } catch (error) {
      throw nightjarAudioUploadFailure('STORAGE', error);
    }
    try {
      return (await finalizeAudioCall({ releaseId, storagePath, durationMinutes })).data;
    } catch (error) {
      try { await deleteObject(fileRef); } catch { /* backend validation is authoritative */ }
      throw nightjarAudioUploadFailure('FINALIZE', error);
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

  async listenCounts() {
    return (await listenCountsCall()).data;
  },

  async playback(releaseId: string) {
    return (await playbackCall({ releaseId })).data;
  },

  async transcript(releaseId: string) {
    return repairMojibakeDisplayData((await transcriptCall({ releaseId })).data);
  },

  async moderationQueue() {
    return repairMojibakeDisplayData((await moderationQueueCall()).data);
  },

  async adminAudioLibrary() {
    return repairMojibakeDisplayData((await audioLibraryCall()).data);
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
