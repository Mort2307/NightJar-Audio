import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { firebaseApp, firebaseAuth } from './firebase-auth';
import { pendingPrivateCreateId, clearPrivateCreateId } from './client-create-idempotency';
import { nightjarAudioContentType, nightjarAudioFileProblem, nightjarAudioUploadFailure } from './audio-upload';
import { repairMojibakeDisplayData } from './text-integrity';

const functions = getFunctions(firebaseApp, 'europe-west2');
const storage = getStorage(firebaseApp);

// Store only an account-bound Storage path after the byte transfer completes.
// No file contents, auth tokens or playable signed URLs are persisted here.
// Firebase alone decides whether a recovery attempt may attach the file.
type PendingAudioFinalize = { storagePath: string; releaseId: string; uid: string; durationMinutes: number | null; startedAt: number };
const pendingAudioKey = (uid: string, releaseId: string) => 'nightjar.audio.pending-finalize.v1:' + uid + ':' + releaseId;
const writePendingAudio = (value: PendingAudioFinalize) => {
  try { window.localStorage.setItem(pendingAudioKey(value.uid, value.releaseId), JSON.stringify(value)); } catch { /* storage may be disabled */ }
};
const readPendingAudio = (uid: string, releaseId: string): PendingAudioFinalize | null => {
  try {
    const raw = window.localStorage.getItem(pendingAudioKey(uid, releaseId));
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingAudioFinalize;
    if (value.uid !== uid || value.releaseId !== releaseId ||
      !value.storagePath?.startsWith(`release-audio/${uid}/${releaseId}/`) ||
      !Number.isFinite(value.startedAt) || Date.now() - value.startedAt > 7 * 24 * 60 * 60 * 1000) return null;
    return value;
  } catch { return null; }
};
const clearPendingAudio = (uid: string, releaseId: string) => {
  try { window.localStorage.removeItem(pendingAudioKey(uid, releaseId)); } catch {}
};

const listCatalogueCall = httpsCallable<{ q?: string; category?: string }, { catalogue: any[] }>(functions, 'listCatalogue');
const createReleaseCall = httpsCallable<Record<string, unknown>, { release: any; reused?: boolean }>(functions, 'createRelease');
const updateReleaseCall = httpsCallable<Record<string, unknown>, { release: any }>(functions, 'updateRelease');
const deleteReleaseCall = httpsCallable<{ releaseId: string }, { deleted: boolean }>(functions, 'deleteRelease');
const adminRemoveReleaseCall = httpsCallable<{ releaseId: string }, { deleted: boolean }>(functions, 'adminRemoveRelease');
const finalizeAudioCall = httpsCallable<{ releaseId: string; storagePath: string; durationMinutes?: number | null }, { release: any }>(functions, 'finalizeReleaseAudio');
const removeAudioCall = httpsCallable<{ releaseId: string }, { removed: boolean }>(functions, 'removeReleaseAudio');
const submitReleaseCall = httpsCallable<{ releaseId: string }, { release: any }>(functions, 'submitReleaseForModeration');
const dashboardCall = httpsCallable<{ creatorUserId?: string }, { releases: any[]; metrics: any }>(functions, 'creatorDashboard');
const listenCountsCall = httpsCallable<void, { counts: { releaseId: string; listens: number }[]; refreshedAt: string }>(functions, 'getReleaseListenCounts');
const playbackCall = httpsCallable<{ releaseId: string }, { releaseId: string; url: string; expiresInSeconds: number; accessReason: 'admin' | 'credited_work' | 'subscription' }>(functions, 'getReleasePlaybackUrl');
const syncAudioCall = httpsCallable<{ releaseId: string }, { url: string; expiresInSeconds: number }>(functions, 'getReleaseSyncAudioUrl');
const saveSyncedTranscriptCall = httpsCallable<{ releaseId: string; transcript: string; language: string; accuracyConfirmed: boolean }, { release: any }>(functions, 'saveSyncedReleaseTranscript');
const transcriptCall = httpsCallable<{ releaseId: string }, {
  releaseId: string;
  title: string;
  transcript: string;
  language: string;
  wordCount: number;
  accessibilityReviewed: boolean;
  accessReason: 'admin' | 'credited_work' | 'subscription';
}>(functions, 'getReleaseTranscript');
const moderationQueueCall = httpsCallable<{cursor?:string}, { releases: any[]; nextCursor:string|null }>(functions, 'releaseModerationQueue');
const audioLibraryCall = httpsCallable<{cursor?:string}, { releases: any[]; totalInspected: number; nextCursor:string|null; truncated: boolean }>(functions, 'adminReleaseAudioLibrary');
const adminPreviewCall = httpsCallable<{ releaseId: string }, { releaseId: string; url: string; expiresInSeconds: number }>(functions, 'getAdminReleasePreviewUrl');
const moderateReleaseCall = httpsCallable<{ releaseId: string; decision: 'approved' | 'changes' | 'rejected'; note?: string; nightjarOriginal?: boolean; originalCommissionConfirmed?: boolean }, { release: any }>(functions, 'moderateRelease');
const recommendationsCall = httpsCallable<{ intent?: string }, { recommendations: any[]; model: any }>(functions, 'recommendations');
const trendingCall = httpsCallable<void, { trending: any[] }>(functions, 'trendingReleases');

export const nightjarCatalogue = {
  async list(q = '', category = '') {
    return repairMojibakeDisplayData((await listCatalogueCall({ q, category })).data);
  },

  async create(input: Record<string, unknown>) {
    const clientRequestId=pendingPrivateCreateId('creator-release');
    const data=(await createReleaseCall({...input,clientRequestId})).data;
    // On a lost reply, retain this ID for safe retry of the SAME operation.
    clearPrivateCreateId('creator-release',clientRequestId);
    return data;
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
      // The bytes are safely in Storage, but the Firestore attachment may
      // still fail. Save only the retry reference until the server confirms.
      writePendingAudio({ uid:user.uid, releaseId, storagePath, durationMinutes:durationMinutes ?? null, startedAt:Date.now() });
      onProgress?.('verifying', 100);
    } catch (error) {
      throw nightjarAudioUploadFailure('STORAGE', error);
    }
    const finalize = () => finalizeAudioCall({ releaseId, storagePath, durationMinutes });
    try {
      const result = (await finalize()).data;
      clearPendingAudio(user.uid, releaseId);
      return result;
    } catch (error) {
      // A lost callable response is NOT evidence that Firestore failed to
      // attach the upload. The backend accepts a repeat of the exact same
      // verified storage path without rewriting the release.
      const code = typeof error === 'object' && error
        ? String((error as {code?:unknown}).code ?? '') : '';
      if (['functions/unavailable','functions/deadline-exceeded','functions/internal'].includes(code)) {
        try {
          const result = (await finalize()).data;
          clearPendingAudio(user.uid, releaseId);
          return result;
        } catch (retryError) { error = retryError; }
      }
      // NEVER delete the private Storage object on an ambiguous finalization
      // result: it might now be referenced by the release and needed for
      // protected playback. Recovery and orphan cleanup must verify the
      // authoritative backend attachment before any destructive operation.
      throw nightjarAudioUploadFailure('FINALIZE', error);
    }
  },

  // A transferred but unconfirmed file can be finalized again after refresh
  // without uploading the bytes twice. A browser-held path is NEVER proof of
  // access or success; the authenticated server re-verifies the object.
  pendingAudio(releaseId: string) {
    const user = firebaseAuth.currentUser;
    return user ? readPendingAudio(user.uid, releaseId) : null;
  },

  async recoverAudio(releaseId: string) {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('Sign in to recover your private audio attachment.');
    const pending = readPendingAudio(user.uid, releaseId);
    if (!pending) throw new Error('No recoverable transferred audio found on this device.');
    try {
      const data = (await finalizeAudioCall({
        releaseId, storagePath:pending.storagePath, durationMinutes:pending.durationMinutes,
      })).data;
      if (data.release?.audioAvailable !== true) {
        throw new Error('Nightjar has not confirmed this recording is attached.');
      }
      clearPendingAudio(user.uid, releaseId);
      return data;
    } catch (error) {
      // Preserve the recovery reference. Do not remove the possibly attached
      // Storage object on a timeout, lost acknowledgement or service failure.
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

  async syncAudioUrl(releaseId: string) {
    return (await syncAudioCall({ releaseId })).data;
  },

  async saveSyncedTranscript(releaseId: string, transcript: string, language = 'en', accuracyConfirmed = false) {
    return (await saveSyncedTranscriptCall({ releaseId, transcript, language, accuracyConfirmed })).data;
  },

  async moderationQueue(cursor?:string) {
    return repairMojibakeDisplayData((await moderationQueueCall(cursor?{cursor}:{})).data);
  },

  async adminAudioLibrary(cursor?:string) {
    return repairMojibakeDisplayData((await audioLibraryCall(cursor?{cursor}:{})).data);
  },

  async adminPreview(releaseId: string) {
    return (await adminPreviewCall({ releaseId })).data;
  },

  async moderate(releaseId: string, decision: 'approved' | 'changes' | 'rejected', note?: string, nightjarOriginal = false, originalCommissionConfirmed = false) {
    return (await moderateReleaseCall({ releaseId, decision, note, nightjarOriginal, originalCommissionConfirmed })).data;
  },

  async recommendations(intent = '') {
    return repairMojibakeDisplayData((await recommendationsCall(intent ? { intent } : {})).data);
  },

  async trending() {
    return repairMojibakeDisplayData((await trendingCall()).data);
  },
};
