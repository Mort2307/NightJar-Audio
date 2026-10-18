import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref, uploadBytes } from 'firebase/storage';
import { firebaseApp, firebaseAuth } from './firebase-auth';
import { nightjarAudioContentType, nightjarAudioFileProblem, nightjarAudioUploadFailure } from './audio-upload';

const functions = getFunctions(firebaseApp, 'europe-west2');
const storage = getStorage(firebaseApp);

export type EditorPortfolioItem = {
  id: string;
  ownerUserId: string;
  title: string;
  description: string;
  services: string[];
  techniques: string[];
  status: 'draft' | 'pending_review' | 'published' | 'changes' | 'rejected' | string;
  beforeAudioAvailable: boolean;
  afterAudioAvailable: boolean;
  rightsConfirmed: boolean;
  contributorPermissionsConfirmed: boolean;
  clientPermissionNote: string | null;
  createdAt: string | null;
  submittedAt: string | null;
  moderatedAt: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  moderationNote?: string | null;
};

const createCall = httpsCallable<Record<string, unknown>, { item: EditorPortfolioItem }>(functions, 'createEditorPortfolioItem');
const mineCall = httpsCallable<void, { items: EditorPortfolioItem[] }>(functions, 'myEditorPortfolio');
const finalizeCall = httpsCallable<{ itemId: string; slot: 'before' | 'after'; storagePath: string }, { item: EditorPortfolioItem }>(functions, 'finalizeEditorPortfolioAudio');
const submitCall = httpsCallable<{ itemId: string }, { item: EditorPortfolioItem }>(functions, 'submitEditorPortfolioItem');
const removeCall = httpsCallable<{ itemId: string }, { removed: boolean; itemId: string }>(functions, 'removeEditorPortfolioItem');
const playbackCall = httpsCallable<{ itemId: string; slot: 'before' | 'after' }, { itemId: string; slot: string; url: string; expiresInSeconds: number }>(functions, 'getEditorPortfolioAudioUrl');
const moderationQueueCall = httpsCallable<void, { items: EditorPortfolioItem[] }>(functions, 'editorPortfolioModerationQueue');
const moderateCall = httpsCallable<{ itemId: string; decision: 'approved' | 'changes' | 'rejected'; note?: string }, { item: EditorPortfolioItem }>(functions, 'moderateEditorPortfolioItem');

export const nightjarEditorPortfolio = {
  async create(input: {
    title: string;
    description?: string;
    services?: string[];
    techniques?: string[];
    rightsConfirmed: true;
    contributorPermissionsConfirmed: true;
    clientPermissionNote?: string;
  }) {
    return (await createCall(input)).data;
  },

  async mine() {
    return (await mineCall()).data;
  },

  async upload(itemId: string, slot: 'before' | 'after', file: File) {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('auth/no-current-user');
    const storagePath = `editor-showcase/${user.uid}/${itemId}/${slot}/${crypto.randomUUID()}`;
    const maxMiB = 20;
    const problem = nightjarAudioFileProblem(file, maxMiB);
    if (problem) throw new Error(problem);
    const contentType = nightjarAudioContentType(file)!;
    const fileRef = ref(storage, storagePath);
    try {
      await uploadBytes(fileRef, file, { contentType, cacheControl: 'private,no-store,max-age=0' });
    } catch (error) {
      throw nightjarAudioUploadFailure('STORAGE', error);
    }
    const finalize = () => finalizeCall({ itemId, slot, storagePath });
    try { return (await finalize()).data; }
    catch (error) {
      const code = typeof error === 'object' && error ? String((error as {code?:unknown}).code ?? '') : '';
      if (['functions/unavailable','functions/deadline-exceeded','functions/internal'].includes(code)) {
        try { return (await finalize()).data; }
        catch (retryError) { error = retryError; }
      }
      // A missing callable response may follow a successful Firestore attach.
      // Never destroy private audio whose owner/status has not been rechecked.
      throw nightjarAudioUploadFailure('FINALIZE', error);
    }
  },

  async submit(itemId: string) {
    return (await submitCall({ itemId })).data;
  },

  async remove(itemId: string) {
    return (await removeCall({ itemId })).data;
  },

  async playback(itemId: string, slot: 'before' | 'after') {
    return (await playbackCall({ itemId, slot })).data;
  },

  async moderationQueue() {
    return (await moderationQueueCall()).data;
  },

  async moderate(itemId: string, decision: 'approved' | 'changes' | 'rejected', note = '') {
    return (await moderateCall({ itemId, decision, note })).data;
  },
};
