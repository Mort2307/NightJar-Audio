import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateCreatorPool } from './creator-pool';

test('one individual receives one equal share across multiple approved roles', () => {
  const result = allocateCreatorPool(1000, [
    { userId: 'person-a', accountStatus: 'active', approvedRoles: ['creator', 'writer'], completedCommitmentRoles: ['creator', 'writer'] },
    { userId: 'person-b', accountStatus: 'active', approvedRoles: ['writer'], completedCommitmentRoles: ['writer'] },
  ]);
  assert.deepEqual(result.payouts.map((item) => item.amountPence), [500, 500]);
});

test('remainder pence is allocated deterministically', () => {
  const result = allocateCreatorPool(10, ['a', 'b', 'c'].map((userId) => ({
    userId, accountStatus: 'active' as const, approvedRoles: ['creator'], completedCommitmentRoles: ['creator'],
  })));
  assert.deepEqual(result.payouts.map((item) => item.amountPence), [4, 3, 3]);
});

test('inactive or unapproved members are not eligible', () => {
  const result = allocateCreatorPool(500, [
    { userId: 'inactive', accountStatus: 'suspended', approvedRoles: ['creator'], completedCommitmentRoles: ['creator'] },
    { userId: 'unapproved', accountStatus: 'active', approvedRoles: [], completedCommitmentRoles: ['creator'] },
  ]);
  assert.equal(result.unallocatedPence, 500);
});
