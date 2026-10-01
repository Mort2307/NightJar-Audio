import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type CreatorRateBand = {
  minPaidSubscribers: number;
  monthlyRatePence: number;
};

export type CommercialSettings = {
  planningMonthlyPricePence: number | null;
  creatorPoolPercent: number | null;
  reservePercent: number | null;
  payoutCadence: string | null;
  eligibleListeningDefinition: string | null;
  compensationModel: 'capped_equal_rate' | null;
  creatorMonthlyCapPence: number | null;
  creatorRateBands: CreatorRateBand[];
  creatorEligibilityDefinition: string | null;
  popularityAffectsBaseRate: false;
  tipsEnabled: boolean;
  individualPurchasesEnabled: boolean;
  listenerSubscriptionUrl: string | null;
};

export type CommercialOverview = {
  settings: CommercialSettings;
  subscriptions: {
    active: number;
    trialing: number;
    pastDue: number;
  };
  confirmedGrossMrrPence: number;
  activePaidSubscribers: number;
  unpricedActiveSubscriptions: number;
  trialPotentialPence: number;
  pastDueAtRiskPence: number;
  potentialGrossWithTrialsPence: number;
  activeCreatorCount: number;
  standardMonthlyCreatorRatePence: number;
  plannedCreatorPayoutPence: number;
  reservePence: number;
  planningBalanceBeforeFeesTaxPence: number;
};

const overviewCall = httpsCallable<void, CommercialOverview>(functions, 'commercialOverview');
const saveCall = httpsCallable<CommercialSettings, { settings: CommercialSettings }>(functions, 'saveCommercialSettings');
const subscriptionsCall = httpsCallable<void, { subscriptions: any[] }>(functions, 'listBillingSubscriptions');
const creatorCompensationCall = httpsCallable<void, {
  model: string | null;
  activePaidSubscribers: number;
  standardMonthlyRatePence: number;
  monthlyCapPence: number | null;
  rateBands: CreatorRateBand[];
  eligibilityDefinition: string | null;
  popularityAffectsBaseRate: false;
  verifiedListeningIsAnalyticsOnly: boolean;
  payoutCadence: string | null;
}>(functions, 'creatorCompensationStatus');
const transparencyCall = httpsCallable<void, any>(functions, 'transparencySnapshot');
const listeningAccessCall = httpsCallable<void, {
  role: string | null;
  subscribed: boolean;
  subscriptionStatus: string | null;
  planningMonthlyPricePence: number | null;
  subscriptionUrl: string | null;
  creditedWorkIncluded: true;
  rule: string;
}>(functions, 'myListeningAccess');

export const nightjarCommercial = {
  async overview() {
    return (await overviewCall()).data;
  },

  async save(settings: CommercialSettings) {
    return (await saveCall(settings)).data;
  },

  async subscriptions() {
    return (await subscriptionsCall()).data;
  },

  async creatorCompensation() {
    return (await creatorCompensationCall()).data;
  },

  async transparency() {
    return (await transparencyCall()).data;
  },

  async listeningAccess() {
    return (await listeningAccessCall()).data;
  },
};
