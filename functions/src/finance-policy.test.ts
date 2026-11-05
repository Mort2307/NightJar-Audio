import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateFinanceRevenuePoolsPence, validateFinanceAllocationPolicy } from './finance-policy';

test('allocation policy requires a complete 100 percent split', () => {
  const valid = { subscriptionPricePence: 699, creatorPoolPercent: 50, nightjarPoolPercent: 30, ownerPoolPercent: 20 };
  assert.deepEqual(validateFinanceAllocationPolicy(valid), valid);
  assert.throws(() => validateFinanceAllocationPolicy({ ...valid, ownerPoolPercent: 19 }), /total exactly 100/);
  assert.throws(() => validateFinanceAllocationPolicy({ ...valid, creatorPoolPercent: 101 }), /between 0 and 100/);
  assert.throws(() => validateFinanceAllocationPolicy({ ...valid, subscriptionPricePence: 0 }), /greater than zero/);
});

test('revenue pools reconcile every penny with deterministic largest-remainder rounding', () => {
  assert.deepEqual(
    allocateFinanceRevenuePoolsPence(10001, { creatorPoolPercent: 50, nightjarPoolPercent: 30, ownerPoolPercent: 20 }),
    { creatorPoolPence: 5001, nightjarPoolPence: 3000, ownerPoolPence: 2000, roundingPence: 0 },
  );
  const onePenny = allocateFinanceRevenuePoolsPence(1, {
    creatorPoolPercent: 50, nightjarPoolPercent: 30, ownerPoolPercent: 20,
  });
  assert.deepEqual(onePenny, { creatorPoolPence: 1, nightjarPoolPence: 0, ownerPoolPence: 0, roundingPence: 0 });
});

test('revenue allocation rejects unsafe amounts and percentages that do not reconcile', () => {
  assert.throws(() => allocateFinanceRevenuePoolsPence(Number.MAX_SAFE_INTEGER + 1, {
    creatorPoolPercent: 50, nightjarPoolPercent: 30, ownerPoolPercent: 20,
  }), /safe integer/);
  assert.throws(() => allocateFinanceRevenuePoolsPence(100, {
    creatorPoolPercent: 50, nightjarPoolPercent: 30, ownerPoolPercent: 19,
  }), /totalling 100/);
});
