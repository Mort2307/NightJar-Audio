import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allocateCreatorPool,
  assessCreatorExpansion,
  DEFAULT_CREATOR_MONTHLY_CAP_PENCE,
  isImmediatelyPreviousCreatorPoolMonth,
  type CreatorPoolMember,
} from './creator-pool';

const eligible = (userId: string): CreatorPoolMember => ({
  userId, accountStatus: 'active', approvedRoles: ['creator'], completedCommitmentRoles: ['creator'],
});

test('one individual receives one equal share across multiple approved roles', () => {
  const result = allocateCreatorPool(1000, [
    { userId: 'person-a', accountStatus: 'active', approvedRoles: ['creator', 'writer'], completedCommitmentRoles: ['creator', 'writer'] },
    { userId: 'person-b', accountStatus: 'active', approvedRoles: ['writer'], completedCommitmentRoles: ['writer'] },
  ], 100000);
  assert.deepEqual(result.payouts.map((item) => item.amountPence), [500, 500]);
});

test('£3,000 hard ceiling retains excess at Creator Pool level', () => {
  const result = allocateCreatorPool(2500000, ['a', 'b', 'c', 'd', 'e'].map(eligible));
  assert.equal(DEFAULT_CREATOR_MONTHLY_CAP_PENCE, 300000);
  assert.deepEqual(result.payouts.map((item) => item.amountPence), [300000, 300000, 300000, 300000, 300000]);
  assert.equal(result.totalAllocatedPence, 1500000);
  assert.equal(result.unallocatedPence, 1000000);
});

test('retained pool plus new monthly contribution can support ten capped creators', () => {
  const result = allocateCreatorPool(3500000, Array.from({ length: 10 }, (_, i) => eligible('creator-' + i)));
  assert.equal(result.payouts.length, 10);
  assert.ok(result.payouts.every((item) => item.amountPence === 300000));
  assert.equal(result.totalAllocatedPence, 3000000);
  assert.equal(result.unallocatedPence, 500000);
});

test('a ten-person roster receives £3,000 each when the available pool is £30,000', () => {
  const result = allocateCreatorPool(3000000, Array.from({ length: 10 }, (_, i) => eligible('creator-' + i)));
  assert.ok(result.payouts.every((item) => item.amountPence === 300000));
  assert.equal(result.unallocatedPence, 0);
});

test('remainder pennies rotate fairly between periods', () => {
  const members = ['a', 'b', 'c'].map(eligible);
  const first = allocateCreatorPool(10, members, 100000, 0);
  const second = allocateCreatorPool(10, members, 100000, first.nextRemainderIndex);
  const third = allocateCreatorPool(10, members, 100000, second.nextRemainderIndex);
  assert.deepEqual(first.payouts.map((item) => item.amountPence), [4, 3, 3]);
  assert.deepEqual(second.payouts.map((item) => item.amountPence), [3, 4, 3]);
  assert.deepEqual(third.payouts.map((item) => item.amountPence), [3, 3, 4]);
});

test('inactive or unapproved members are not eligible', () => {
  const result = allocateCreatorPool(500, [
    { userId: 'inactive', accountStatus: 'suspended', approvedRoles: ['creator'], completedCommitmentRoles: ['creator'] },
    { userId: 'unapproved', accountStatus: 'active', approvedRoles: [], completedCommitmentRoles: ['creator'] },
  ]);
  assert.equal(result.unallocatedPence, 500);
});

test('Soft Creator credit-only profiles do not qualify for the paid Creator Pool', () => {
  const result = allocateCreatorPool(500, [{
    userId: 'soft-creator',
    accountStatus: 'active',
    approvedRoles: ['listener', 'soft_creator'],
    completedCommitmentRoles: ['listener', 'soft_creator'],
  }]);
  assert.equal(result.eligibleCreatorCount, 0);
  assert.equal(result.unallocatedPence, 500);
});

test('duplicate eligibility rows never create duplicate payouts', () => {
  const person = {
    userId: 'same-person',
    accountStatus: 'active' as const,
    approvedRoles: ['creator', 'writer'],
    completedCommitmentRoles: ['writer'],
  };
  const result = allocateCreatorPool(101, [person, person], 100000);
  assert.equal(result.eligibleCreatorCount, 1);
  assert.deepEqual(result.payouts, [{ userId: 'same-person', amountPence: 101 }]);
});

test('zero eligible people retain the entire pool without creating payouts', () => {
  const result = allocateCreatorPool(1234, [], 100000);
  assert.equal(result.eligibleCreatorCount, 0);
  assert.equal(result.totalAllocatedPence, 0);
  assert.equal(result.unallocatedPence, 1234);
  assert.deepEqual(result.payouts, []);
});

test('zero-value pool creates no zero-value payout records', () => {
  const result = allocateCreatorPool(0, [{
    userId: 'eligible-person', accountStatus: 'active', approvedRoles: ['artist'], completedCommitmentRoles: ['artist'],
  }], 100000);
  assert.equal(result.eligibleCreatorCount, 1);
  assert.deepEqual(result.payouts, []);
});

const expansionPeriods = (contributions: number[]) => contributions.map((monthlyCreatorPoolContributionPence, index) => ({
  periodId: '2026-0' + (9 - index),
  status: 'approved',
  monthlyCreatorPoolContributionPence,
  totalAllocatedPence: 1500000,
  eligibleCreatorCount: 5,
}));

test('expansion gate requires three approved periods and excludes retained balances', () => {
  const result = assessCreatorExpansion([
    { periodId: '2026-10', status: 'approved', monthlyCreatorPoolContributionPence: 2500000, totalAllocatedPence: 1500000, eligibleCreatorCount: 5 },
    { periodId: '2026-09', status: 'approved', monthlyCreatorPoolContributionPence: 3000000, totalAllocatedPence: 1500000, eligibleCreatorCount: 5 },
  ], 10);
  assert.equal(result.status, 'insufficient_history');
  assert.equal(result.readyForReview, false);
});

test('expansion gate approves a ten-person roster only when all three monthly contributions support £3,000 each', () => {
  const result = assessCreatorExpansion(expansionPeriods([3200000, 3100000, 3000000]), 10);
  assert.equal(result.status, 'ready');
  assert.equal(result.protectedMonthlyPayoutBenchmarkPence, 300000);
  assert.equal(result.requiredMonthlyCreatorPoolPence, 3000000);
  assert.equal(result.minimumRecentMonthlyContributionPence, 3000000);
  assert.equal(result.supportedCreatorCount, 10);
  assert.equal(result.shortfallPence, 0);
});

test('retained balance cannot make an underfunded recurring expansion ready', () => {
  const result = assessCreatorExpansion(expansionPeriods([3500000, 2800000, 3400000]), 10);
  assert.equal(result.status, 'not_ready');
  assert.equal(result.minimumRecentMonthlyContributionPence, 2800000);
  assert.equal(result.shortfallPence, 200000);
  assert.equal(result.supportedCreatorCount, 9);
});

test('no expansion is required when proposed roster matches the current roster', () => {
  const result = assessCreatorExpansion(expansionPeriods([3200000, 3100000, 3000000]), 5);
  assert.equal(result.status, 'no_expansion_required');
  assert.equal(result.readyForReview, true);
});

test('expansion gate rejects three records with a missing calendar month', () => {
  const result = assessCreatorExpansion([
    { periodId: '2026-10', status: 'approved', monthlyCreatorPoolContributionPence: 3200000, totalAllocatedPence: 1500000, eligibleCreatorCount: 5 },
    { periodId: '2026-08', status: 'approved', monthlyCreatorPoolContributionPence: 3100000, totalAllocatedPence: 1500000, eligibleCreatorCount: 5 },
    { periodId: '2026-07', status: 'approved', monthlyCreatorPoolContributionPence: 3000000, totalAllocatedPence: 1500000, eligibleCreatorCount: 5 },
  ], 10);
  assert.equal(result.status, 'insufficient_history');
  assert.equal(result.readyForReview, false);
});


test('Creator Pool retained balance can only roll through the immediately following month', () => {
  assert.equal(isImmediatelyPreviousCreatorPoolMonth('2026-10', '2026-11'), true);
  assert.equal(isImmediatelyPreviousCreatorPoolMonth('2025-12', '2026-01'), true);
  assert.equal(isImmediatelyPreviousCreatorPoolMonth('2026-09', '2026-11'), false);
  assert.equal(isImmediatelyPreviousCreatorPoolMonth('2026-11', '2026-11'), false);
  assert.equal(isImmediatelyPreviousCreatorPoolMonth('bad-period', '2026-11'), false);
});

test('allocator and expansion gate reject invalid amounts and limits', () => {
  assert.throws(() => allocateCreatorPool(-1, []), /non-negative/);
  assert.throws(() => allocateCreatorPool(10, [], 0), /positive/);
  assert.throws(() => allocateCreatorPool(10, [], 100, -1), /non-negative/);
  assert.throws(() => assessCreatorExpansion([], 0), /positive whole number/);
});
