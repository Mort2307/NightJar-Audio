import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCreatorPoolPence, calculateEligibleNetRevenuePence, isSameManualPayment } from './finance-settlement';

test('eligible net revenue deducts refunds, chargebacks, fees, VAT and other deductions', () => {
  assert.equal(calculateEligibleNetRevenuePence({
    grossPence: 10000, refundPence: 500, chargebackPence: 100,
    processorFeePence: 300, vatPence: 1500, otherDeductionsPence: 100,
  }), 7500);
});

test('revenue deductions cannot exceed gross receipts', () => {
  assert.throws(() => calculateEligibleNetRevenuePence({
    grossPence: 100, refundPence: 80, chargebackPence: 30,
    processorFeePence: 0, vatPence: 0, otherDeductionsPence: 0,
  }), /cannot exceed gross/);
});

test('settlement amounts must be whole non-negative pence', () => {
  assert.throws(() => calculateEligibleNetRevenuePence({
    grossPence: 100.5, refundPence: 0, chargebackPence: 0,
    processorFeePence: 0, vatPence: 0, otherDeductionsPence: 0,
  }), /safe integer/);
});

test('Creator Pool is 50 percent of eligible net revenue with deterministic penny rounding', () => {
  assert.equal(calculateCreatorPoolPence(10001), 5000);
  assert.equal(calculateCreatorPoolPence(10), 5);
});

test('settlement deduction totals that exceed safe integer precision are rejected', () => {
  assert.throws(() => calculateEligibleNetRevenuePence({
    grossPence: Number.MAX_SAFE_INTEGER,
    refundPence: Number.MAX_SAFE_INTEGER,
    chargebackPence: Number.MAX_SAFE_INTEGER,
    processorFeePence: 0, vatPence: 0, otherDeductionsPence: 0,
  }), /cannot exceed gross|safe integer/);
});


test('manual payment retry is idempotent only when every original detail matches', () => {
  const original = {
    periodId: '2026-11', userId: 'contributor-1',
    amountPence: 1250, reference: 'BANK-REF-1001', paidAt: '2026-11-05',
  };
  assert.equal(isSameManualPayment(original, original), true);
  assert.equal(isSameManualPayment(original, { ...original, amountPence: 1251 }), false);
  assert.equal(isSameManualPayment(original, { ...original, paidAt: '2026-11-06' }), false);
  assert.equal(isSameManualPayment(original, { ...original, reference: 'BANK-REF-1002' }), false);
  assert.equal(isSameManualPayment(original, { ...original, userId: 'contributor-2' }), false);
  assert.equal(isSameManualPayment(original, { ...original, periodId: '2026-10' }), false);
});

test('tax payment retry compares amount, reference, date and period without requiring a payee', () => {
  const original = {
    periodId: '2026-11', amountPence: 5000,
    reference: 'HMRC-REF-1001', paidAt: '2026-11-05',
  };
  assert.equal(isSameManualPayment(original, original), true);
  assert.equal(isSameManualPayment(original, { ...original, amountPence: 5001 }), false);
  assert.equal(isSameManualPayment(original, { ...original, paidAt: '2026-11-06' }), false);
});
