import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { hasPaidEntitlement, mayUseTemporaryAccess } from './entitlements.js';

const current = { userId: 'listener-1', status: 'active', providerVerified: true, billingProvider: 'processor', providerSubscriptionId: 'sub-1', confirmedMonthlyAmountPence: 500, currentPeriodEnd: '2030-01-01T00:00:00Z' };

test('a verified and current provider subscription belongs to exactly one account', () => {
  assert.equal(hasPaidEntitlement(current, 'listener-1', Date.parse('2029-12-01')), true);
  assert.equal(hasPaidEntitlement(current, 'listener-2', Date.parse('2029-12-01')), false);
  assert.equal(hasPaidEntitlement({ ...current, currentPeriodEnd: '2028-01-01T00:00:00Z' }, 'listener-1', Date.parse('2029-12-01')), false);
});

test('planning records, trials, past due and unverified billing cannot unlock audio', () => {
  for (const change of [
    { providerVerified: false }, { billingProvider: '' }, { providerSubscriptionId: '' },
    { status: 'trialing' }, { status: 'past_due' }, { status: 'canceled' }, { confirmedMonthlyAmountPence: 0 },
  ]) assert.equal(hasPaidEntitlement({ ...current, ...change }, 'listener-1', Date.parse('2029-12-01')), false);
  assert.equal(hasPaidEntitlement(null, 'listener-1'), false);
});

test('temporary access is limited to active approved testers before public launch', () => {
  const base = { publicAccessEnabled: false, ageAssuranceConfigured: false, administrator: false, explicitTester: false, accountActive: true };
  assert.equal(mayUseTemporaryAccess(base), false);
  assert.equal(mayUseTemporaryAccess({ ...base, explicitTester: true }), true);
  assert.equal(mayUseTemporaryAccess({ ...base, administrator: true }), true);
  assert.equal(mayUseTemporaryAccess({ ...base, explicitTester: true, accountActive: false }), false);
  assert.equal(mayUseTemporaryAccess({ ...base, explicitTester: true, publicAccessEnabled: true }), false);
  assert.equal(mayUseTemporaryAccess({ ...base, explicitTester: true, ageAssuranceConfigured: true }), false);
});
