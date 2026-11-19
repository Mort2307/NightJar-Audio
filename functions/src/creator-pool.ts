export const DEFAULT_CREATOR_MONTHLY_CAP_PENCE = 300000;

export type CreatorPoolMember = {
  userId: string;
  accountStatus: 'active' | 'pending_review' | 'suspended' | 'closed';
  approvedRoles: string[];
  completedCommitmentRoles: string[];
};

export type CreatorPoolPayout = { userId: string; amountPence: number };

export type CreatorPoolAllocation = {
  /** Total available pool, including any prior retained balance. */
  poolPence: number;
  eligibleCreatorCount: number;
  totalAllocatedPence: number;
  /** Balance retained in the Creator Pool after applying the monthly ceiling. */
  unallocatedPence: number;
  capPence: number;
  remainderStartIndex: number;
  nextRemainderIndex: number;
  payouts: CreatorPoolPayout[];
};

/**
 * Allocates an already-calculated Creator Pool in whole pence.
 * A person qualifies when at least one approved creative role has reached
 * 100% of its applicable commitments. Multiple roles never create extra shares.
 *
 * The monthly ceiling is a hard maximum per person. Any amount above the sum
 * of capped payouts remains at pool level and is not recorded as an individual
 * creator entitlement or personal carry-forward.
 *
 * Remainder pennies rotate between eligible people each period so the same
 * account is not repeatedly favoured by an alphabetic or UID sort.
 */
export const allocateCreatorPool = (
  poolPence: number,
  members: CreatorPoolMember[],
  capPence = DEFAULT_CREATOR_MONTHLY_CAP_PENCE,
  remainderStartIndex = 0,
): CreatorPoolAllocation => {
  if (!Number.isSafeInteger(poolPence) || poolPence < 0) {
    throw new Error('Creator Pool must be a non-negative safe integer in pence.');
  }
  if (!Number.isSafeInteger(capPence) || capPence < 1) {
    throw new Error('Creator monthly cap must be a positive safe integer in pence.');
  }
  if (!Number.isSafeInteger(remainderStartIndex) || remainderStartIndex < 0) {
    throw new Error('Remainder rotation index must be a non-negative safe integer.');
  }

  const eligibleIds = Array.from(new Set(
    members
      .filter((member) =>
        member.accountStatus === 'active' &&
        member.userId.trim().length > 0 &&
        member.approvedRoles.some((role) =>
          ['creator', 'writer', 'editor', 'artist'].includes(role) &&
          member.completedCommitmentRoles.includes(role),
        ),
      )
      .map((member) => member.userId.trim()),
  )).sort((a, b) => a.localeCompare(b));

  if (eligibleIds.length === 0 || poolPence === 0) {
    return {
      poolPence,
      eligibleCreatorCount: eligibleIds.length,
      totalAllocatedPence: 0,
      unallocatedPence: poolPence,
      capPence,
      remainderStartIndex,
      nextRemainderIndex: remainderStartIndex,
      payouts: [],
    };
  }

  const count = eligibleIds.length;
  const baseShare = Math.floor(poolPence / count);
  const remainder = poolPence % count;
  const start = remainderStartIndex % count;
  const payouts = eligibleIds.map((userId, index) => {
    const receivesRemainderPenny = ((index - start + count) % count) < remainder;
    const equalSharePence = baseShare + (receivesRemainderPenny ? 1 : 0);
    return { userId, amountPence: Math.min(equalSharePence, capPence) };
  });
  const totalAllocatedPence = payouts.reduce((sum, payout) => sum + payout.amountPence, 0);

  // If all shares are at the ceiling, any remaining amount stays in the pool
  // and no remainder penny was actually assigned.
  const distributedRemainder = baseShare < capPence ? remainder : 0;
  const nextRemainderIndex = (start + distributedRemainder) % count;

  return {
    poolPence,
    eligibleCreatorCount: count,
    totalAllocatedPence,
    unallocatedPence: poolPence - totalAllocatedPence,
    capPence,
    remainderStartIndex: start,
    nextRemainderIndex,
    payouts,
  };
};

export type CreatorExpansionPeriod = {
  periodId: string;
  status: string;
  monthlyCreatorPoolContributionPence: number;
  totalAllocatedPence: number;
  eligibleCreatorCount: number;
};

export type CreatorExpansionAssessment = {
  status: 'insufficient_history' | 'no_expansion_required' | 'ready' | 'not_ready';
  readyForReview: boolean;
  reason: string;
  historyPeriods: string[];
  currentEligibleCreatorCount: number | null;
  proposedCreatorCount: number;
  protectedMonthlyPayoutBenchmarkPence: number | null;
  requiredMonthlyCreatorPoolPence: number | null;
  minimumRecentMonthlyContributionPence: number | null;
  averageRecentMonthlyContributionPence: number | null;
  supportedCreatorCount: number | null;
  shortfallPence: number | null;
};

/**
 * Conservative expansion gate. It requires three approved payout periods.
 * The protected benchmark is the average actual per-person allocation across
 * those periods, capped at the configured individual ceiling. All three
 * recurring monthly Creator Pool contributions (not carry-forward reserves)
 * must support the proposed roster at that benchmark.
 */
export const assessCreatorExpansion = (
  periodsNewestFirst: CreatorExpansionPeriod[],
  proposedCreatorCount: number,
  capPence = DEFAULT_CREATOR_MONTHLY_CAP_PENCE,
): CreatorExpansionAssessment => {
  if (!Number.isSafeInteger(proposedCreatorCount) || proposedCreatorCount < 1) {
    throw new Error('Proposed creator count must be a positive whole number.');
  }
  if (!Number.isSafeInteger(capPence) || capPence < 1) {
    throw new Error('Creator monthly cap must be a positive safe integer in pence.');
  }

  const history = periodsNewestFirst.slice(0, 3);
  const base = {
    historyPeriods: history.map((period) => period.periodId),
    proposedCreatorCount,
  };
  if (history.length < 3 || history.some((period) => period.status !== 'approved'
    || !Number.isSafeInteger(period.monthlyCreatorPoolContributionPence)
    || period.monthlyCreatorPoolContributionPence < 0
    || !Number.isSafeInteger(period.totalAllocatedPence)
    || period.totalAllocatedPence < 0
    || !Number.isSafeInteger(period.eligibleCreatorCount)
    || period.eligibleCreatorCount < 1)) {
    return {
      ...base, status: 'insufficient_history', readyForReview: false,
      reason: 'Three consecutive approved payout periods with reconciled Creator Pool contributions are required before expansion can be assessed.',
      currentEligibleCreatorCount: history[0]?.eligibleCreatorCount ?? null,
      protectedMonthlyPayoutBenchmarkPence: null,
      requiredMonthlyCreatorPoolPence: null,
      minimumRecentMonthlyContributionPence: null,
      averageRecentMonthlyContributionPence: null,
      supportedCreatorCount: null,
      shortfallPence: null,
    };
  }

  const currentEligibleCreatorCount = history[0].eligibleCreatorCount;
  if (proposedCreatorCount < currentEligibleCreatorCount) {
    throw new Error('Proposed creator count cannot be below the current eligible roster.');
  }

  const perCreatorPayouts = history.map((period) => Math.min(
    capPence,
    Math.floor(period.totalAllocatedPence / period.eligibleCreatorCount),
  ));
  const protectedMonthlyPayoutBenchmarkPence = Math.min(
    capPence,
    Math.floor(perCreatorPayouts.reduce((sum, amount) => sum + amount, 0) / perCreatorPayouts.length),
  );
  const contributions = history.map((period) => period.monthlyCreatorPoolContributionPence);
  const minimumRecentMonthlyContributionPence = Math.min(...contributions);
  const averageRecentMonthlyContributionPence = Math.floor(
    contributions.reduce((sum, amount) => sum + amount, 0) / contributions.length,
  );

  if (proposedCreatorCount === currentEligibleCreatorCount) {
    return {
      ...base, status: 'no_expansion_required', readyForReview: true,
      reason: 'The proposed roster does not add any Creator Pool members.',
      currentEligibleCreatorCount, protectedMonthlyPayoutBenchmarkPence,
      requiredMonthlyCreatorPoolPence: currentEligibleCreatorCount * protectedMonthlyPayoutBenchmarkPence,
      minimumRecentMonthlyContributionPence, averageRecentMonthlyContributionPence,
      supportedCreatorCount: protectedMonthlyPayoutBenchmarkPence > 0
        ? Math.floor(minimumRecentMonthlyContributionPence / protectedMonthlyPayoutBenchmarkPence) : 0,
      shortfallPence: 0,
    };
  }

  const requiredMonthlyCreatorPoolPence = proposedCreatorCount * protectedMonthlyPayoutBenchmarkPence;
  const supportedCreatorCount = protectedMonthlyPayoutBenchmarkPence > 0
    ? Math.floor(minimumRecentMonthlyContributionPence / protectedMonthlyPayoutBenchmarkPence)
    : 0;
  const shortfallPence = Math.max(0, requiredMonthlyCreatorPoolPence - minimumRecentMonthlyContributionPence);
  const readyForReview = protectedMonthlyPayoutBenchmarkPence > 0
    && minimumRecentMonthlyContributionPence >= requiredMonthlyCreatorPoolPence;

  return {
    ...base,
    status: readyForReview ? 'ready' : 'not_ready',
    readyForReview,
    reason: readyForReview
      ? 'Each of the last three monthly Creator Pool contributions supports the proposed roster at the protected payout benchmark. Owner approval is still required.'
      : 'Recurring Creator Pool contributions are not yet sufficient in every one of the last three periods. Retained balances are excluded from this sustainability test.',
    currentEligibleCreatorCount,
    protectedMonthlyPayoutBenchmarkPence,
    requiredMonthlyCreatorPoolPence,
    minimumRecentMonthlyContributionPence,
    averageRecentMonthlyContributionPence,
    supportedCreatorCount,
    shortfallPence,
  };
};
