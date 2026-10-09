import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';
import type { NightjarLegalDocumentId } from '../legal/nightjarLegal';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type LegalAgreementStatus = {
  id: NightjarLegalDocumentId;
  version: string;
  title: string;
  path: string;
  requiredForAccount: boolean;
  requiredForProfessional: boolean;
  accepted: boolean;
  acceptedVersion: string | null;
  acceptedAt: string | null;
};

const statusCall = httpsCallable<void, { documents: LegalAgreementStatus[] }>(functions, 'getLegalAgreementStatus');
const acceptCall = httpsCallable<{
  documents: Array<{ id: NightjarLegalDocumentId; version: string; accepted: true }>;
  source?: string;
}, { accepted: Array<{ id: NightjarLegalDocumentId; version: string }> }>(functions, 'acceptLegalAgreements');

export const nightjarLegal = {
  async status() { return (await statusCall()).data; },
  async accept(documents: Array<{ id: NightjarLegalDocumentId; version: string; accepted: true }>, source='account') {
    return (await acceptCall({ documents, source })).data;
  },
};
