import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const resumeCall = httpsCallable<{ releaseId: string }, { releaseId: string; positionSeconds: number; durationSeconds: number }>(functions, 'listeningResume');
const eventCall = httpsCallable<Record<string, unknown>, { recorded: boolean }>(functions, 'recordListeningEvent');
const tasteCall = httpsCallable<void, { vector: { label: string; weight: number }[] }>(functions, 'tasteProfile');

export const nightjarListening = {
  async resume(releaseId: string) {
    return (await resumeCall({ releaseId })).data;
  },

  async record(input: Record<string, unknown>) {
    return (await eventCall(input)).data;
  },

  async taste() {
    return (await tasteCall()).data;
  },
};
