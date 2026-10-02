import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type CreatorRateBand = {
  minPaidSubscribers: number;
  monthlyRatePence: number;
};

export type CommercialSettings = {
  planningMonthlyPricePence: number | null;
  creatorPoolPercent: number;
  companyProfitPercent: number;
  businessFundPercent: number;
  planningEligibleNetPercent: number;
  safeCreatorUtilizationPercent: number;
  revenueAveragingDays: number;
  subscriberStressTestPercent: number;
  minimumBankedCreatorSlots: number;
  automaticCreatorSlotOpening: false;
  creatorSlotRecommendations: boolean;
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

export type CreatorSlot = {
  userId: string;
  displayName: string;
  email: string | null;
  paidCreatorSlotActive: boolean;
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
  eligibleNetRevenuePence: number;
  eligibleNetRevenueSource: 'confirmed' | 'planning_estimate' | 'mixed' | 'none';
  confirmedEligibleNetSubscriptionCount: number;
  rollingAverageEligibleNetRevenuePence: number;
  revenueHistorySampleDays: number;
  sustainableEligibleNetRevenuePence: number;
  activeCreatorCount: number;
  paidCreatorCount: number;
  standardMonthlyCreatorRatePence: number;
  plannedCreatorPayoutPence: number;
  creatorCapacityPence: number;
  companyProfitAllocationPence: number;
  coreBusinessFundPence: number;
  unusedCreatorCapacityPence: number;
  growthAndStabilityFundContributionPence: number;
  safeCreatorPayrollPence: number;
  stressEligibleNetRevenuePence: number;
  stressCreatorCapacityPence: number;
  theoreticalCreatorCapacity: number;
  safeCreatorCapacity: number;
  bankedCreatorCapacity: number;
  safeReleaseSlots: number;
  creatorBudgetUtilizationPercent: number;
  stressTestPass: boolean;
  nextCreatorRecommended: boolean;
  capacityStatus: 'healthy' | 'guarded' | 'overcommitted';
  creatorSlots: CreatorSlot[];
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
const setCreatorPaidSlotCall = httpsCallable<{ userId: string; active: boolean }, {
  active: boolean;
  overview: CommercialOverview;
}>(functions, 'setCreatorPaidSlotStatus');
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

  async setCreatorPaidSlot(userId: string, active: boolean) {
    return (await setCreatorPaidSlotCall({ userId, active })).data;
  },

  async transparency() {
    return (await transparencyCall()).data;
  },

  async listeningAccess() {
    return (await listeningAccessCall()).data;
  },
};
