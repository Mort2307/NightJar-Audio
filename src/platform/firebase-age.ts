import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type AgeStatus = {
  verified: boolean;
  status: string;
  ageThreshold: number;
  configured: boolean;
  provider: string;
  environment: string;
  verifiedAt: any;
  reverifyRequired: boolean;
  testAvailable: boolean;
  providerVerified?: boolean;
  providerStatus?: string;
  livePilotAvailable?: boolean;
  diditPilotEligible?: boolean;
  sessionActive?: boolean;
  verificationPaused?: boolean;
  temporaryBypass?: boolean;
  temporaryBypassReason?: string | null;
};

const statusCall = httpsCallable<void, AgeStatus>(functions, 'ageStatus');
const startCall = httpsCallable<void, Record<string, unknown>>(functions, 'startAgeAssurance');
const testPassCall = httpsCallable<void, { verified: boolean; status: string; provider: string }>(functions, 'adminAgeTestPass');

export const nightjarAge = {
  async status() {
    return (await statusCall()).data;
  },

  async start() {
    return (await startCall()).data;
  },

  async adminTestPass() {
    return (await testPassCall()).data;
  },
};
