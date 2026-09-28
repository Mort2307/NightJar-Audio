import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type CollaborationStatus =
  | 'sent'
  | 'interested'
  | 'discussing'
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'in_production'
  | 'completed';

const directoryCall = httpsCallable<void, { people: any[] }>(functions, 'collaborationDirectory');
const sendCall = httpsCallable<Record<string, unknown>, { proposal: any }>(functions, 'sendCollaborationProposal');
const listCall = httpsCallable<void, { proposals: any[] }>(functions, 'listMyCollaborations');
const interestCall = httpsCallable<{ scriptId: string; message?: string }, { proposal: any }>(functions, 'expressScriptInterest');
const respondCall = httpsCallable<{ collaborationId: string; status: CollaborationStatus; responseNote?: string }, { proposal: any }>(functions, 'respondCollaborationProposal');
const statusCall = httpsCallable<{ collaborationId: string; status: CollaborationStatus }, { proposal: any }>(functions, 'updateCollaborationStatus');

export const nightjarCollaboration = {
  async directory() {
    return (await directoryCall()).data;
  },

  async list() {
    return (await listCall()).data;
  },

  async expressInterest(scriptId: string, message = '') {
    return (await interestCall({ scriptId, message })).data;
  },

  async send(input: Record<string, unknown>) {
    return (await sendCall(input)).data;
  },

  async respond(collaborationId: string, status: CollaborationStatus, responseNote = '') {
    return (await respondCall({ collaborationId, status, responseNote })).data;
  },

  async setStatus(collaborationId: string, status: CollaborationStatus) {
    return (await statusCall({ collaborationId, status })).data;
  },
};
