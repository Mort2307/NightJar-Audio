export type CreatorPoolMember = {
  userId: string;
  accountStatus: 'active' | 'pending_review' | 'suspended' | 'closed';
  approvedRoles: string[];
  completedCommitmentRoles: string[];
};

export type CreatorPoolPayout = { userId: string; amountPence: number };

export type CreatorPoolAllocation = {
  poolPence: number;
  eligibleCreatorCount: number;
  totalAllocatedPence: number;
  unallocatedPence: number;
  payouts: CreatorPoolPayout[];
};

/**
 * Allocates an already-calculated Creator Pool in whole pence.
 * A person qualifies when at least one approved creative role has reached
 * 100% of its applicable commitments. Multiple roles never create extra shares.
 *
 * This function deliberately does not calculate revenue, tax, VAT, processor
 * fees or eligibility periods; those must be established by authoritative
 * backend ledgers before calling it.
 */
export const allocateCreatorPool = (
  poolPence: number,
  members: CreatorPoolMember[],
): CreatorPoolAllocation => {
  if (!Number.isSafeInteger(poolPence) || poolPence < 0) {
    throw new Error('Creator Pool must be a non-negative safe integer in pence.');
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
      payouts: [],
    };
  }

  const baseShare = Math.floor(poolPence / eligibleIds.length);
  const remainder = poolPence % eligibleIds.length;
  const payouts = eligibleIds.map((userId, index) => ({
    userId,
    amountPence: baseShare + (index < remainder ? 1 : 0),
  }));
  const totalAllocatedPence = payouts.reduce((sum, payout) => sum + payout.amountPence, 0);

  return {
    poolPence,
    eligibleCreatorCount: eligibleIds.length,
    totalAllocatedPence,
    unallocatedPence: poolPence - totalAllocatedPence,
    payouts,
  };
};
