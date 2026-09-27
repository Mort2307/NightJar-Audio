import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type CommercialSettings = {
  planningMonthlyPricePence: number | null;
  creatorPoolPercent: number | null;
  reservePercent: number | null;
  payoutCadence: string | null;
  eligibleListeningDefinition: string | null;
};

export type CommercialOverview = {
  settings: CommercialSettings;
  subscriptions: {
    active: number;
    trialing: number;
    pastDue: number;
  };
  confirmedGrossMrrPence: number;
};

const overviewCall = httpsCallable<void, CommercialOverview>(functions, 'commercialOverview');
const saveCall = httpsCallable<CommercialSettings, { settings: CommercialSettings }>(functions, 'saveCommercialSettings');

export const nightjarCommercial = {
  async overview() {
    return (await overviewCall()).data;
  },

  async save(settings: CommercialSettings) {
    return (await saveCall(settings)).data;
  },
};
