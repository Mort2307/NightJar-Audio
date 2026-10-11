import { getFunctions, httpsCallable } from 'firebase/functions';
import { deleteObject, getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { firebaseApp, firebaseAuth } from './firebase-auth';
import { nightjarAudioContentType, nightjarAudioFileProblem, nightjarAudioUploadFailure } from './audio-upload';

const functions = getFunctions(firebaseApp, 'europe-west2');
const storage = getStorage(firebaseApp);
const verifyCall = httpsCallable<
  { storagePath: string },
  { verified: boolean; bytes: number; contentType: string; private: boolean; retained: boolean }
>(functions, 'adminVerifyAudioUpload');

/**
 * Runs a real, temporary Firebase Storage upload against a private admin-only
 * path, and asks the backend to validate its metadata and delete it.
 *
 * No published release, showcase, user impersonation or permanent audio.
 * Production Creator/Editor role-specific Storage rules are NOT exercised.
 */
export const adminAudioUploadTest = async (
  file: File,
  onProgress: (progress: number) => void,
  onStage: (stage: 'STORAGE' | 'FINALIZE' | 'CLEANUP') => void,
) => {
  const issue = nightjarAudioFileProblem(file, 10);
  if (issue) throw new Error(issue);
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Sign in to Nightjar as an administrator before testing audio.');
  const contentType = nightjarAudioContentType(file)!;
  const fileRef = ref(storage, `audio-upload-diagnostics/${user.uid}/${crypto.randomUUID()}`);
  let stage: 'STORAGE' | 'FINALIZE' = 'STORAGE';
  try {
    onStage(stage);
    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(fileRef, file, { contentType, cacheControl: 'private,no-store,max-age=0' });
      task.on('state_changed',
        (snapshot) => onProgress(Math.round(100 * snapshot.bytesTransferred / snapshot.totalBytes)),
        reject,
        resolve,
      );
    });
    stage = 'FINALIZE';
    onStage(stage);
    const result = (await verifyCall({ storagePath: fileRef.fullPath })).data;
    if (!result.verified || !result.private || result.retained || result.bytes !== file.size) {
      throw new Error('The verification response did not match the temporary audio upload.');
    }
    return result;
  } catch (error) {
    if (error instanceof Error && !('code' in error) && !('name' in error && error.name === 'FirebaseError')) {
      throw error;
    }
    throw nightjarAudioUploadFailure(stage, error);
  } finally {
    onStage('CLEANUP');
    // The backend deletes successfully verified files. This is a fail-safe
    // for transfer/metadata errors, interrupted verifications and old builds.
    try { await deleteObject(fileRef); } catch { /* not found is expected after successful backend cleanup */ }
  }
};
