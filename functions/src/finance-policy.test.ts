import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateFinanceRevenuePoolsPence, validateFinanceAllocationPolicy } from './finance-policy';

test('allocation policy requires three operating allocations plus an optional tax reserve to total 100 percent', () => {
  const valid = {
    subscriptionPricePence: 699, creatorPoolPercent: 50,
    nightjarPoolPercent: 30, ownerPoolPercent: 20, taxReservePercent: 0,
  };
  assert.deepEqual(validateFinanceAllocationPolicy(valid), valid);
  assert.throws(() => validateFinanceAllocationPolicy({ ...valid, ownerPoolPercent: 19 }), /total exactly 100/);
  assert.throws(() => validateFinanceAllocationPolicy({ ...valid, creatorPoolPercent: 101 }), /between 0 and 100/);
  assert.throws(() => validateFinanceAllocationPolicy({ ...valid, subscriptionPricePence: 0 }), /greater than zero/);
});

test('revenue pools reconcile every penny with deterministic largest-remainder rounding', () => {
  const allocation = allocateFinanceRevenuePoolsPence(10001, {
    creatorPoolPercent: 50, nightjarPoolPercent: 30, ownerPoolPercent: 10, taxReservePercent: 10,
  });
  assert.deepEqual(allocation, {
    creatorPoolPence: 5001, nightjarPoolPence: 3000, ownerPoolPence: 1000,
    taxReservePoolPence: 1000, roundingPence: 0,
  });
  const onePenny = allocateFinanceRevenuePoolsPence(1, {
    creatorPoolPercent: 50, nightjarPoolPercent: 30, ownerPoolPercent: 10, taxReservePercent: 10,
  });
  assert.deepEqual(onePenny, {
    creatorPoolPence: 1, nightjarPoolPence: 0, ownerPoolPence: 0,
    taxReservePoolPence: 0, roundingPence: 0,
  });
});

test('zero tax reserve leaves the full policy with the three operating pools', () => {
  assert.deepEqual(
    allocateFinanceRevenuePoolsPence(10000, {
      creatorPoolPercent: 50, nightjarPoolPercent: 30, ownerPoolPercent: 20, taxReservePercent: 0,
    }),
    { creatorPoolPence: 5000, nightjarPoolPence: 3000, ownerPoolPence: 2000, taxReservePoolPence: 0, roundingPence: 0 },
  );
});

test('revenue allocation rejects unsafe amounts and percentages that do not reconcile', () => {
  assert.throws(() => allocateFinanceRevenuePoolsPence(Number.MAX_SAFE_INTEGER + 1, {
    creatorPoolPercent: 50, nightjarPoolPercent: 30, ownerPoolPercent: 10, taxReservePercent: 10,
  }), /safe integer/);
  assert.throws(() => allocateFinanceRevenuePoolsPence(100, {
    creatorPoolPercent: 50, nightjarPoolPercent: 30, ownerPoolPercent: 19, taxReservePercent: 10,
  }), /totalling 100/);
});
