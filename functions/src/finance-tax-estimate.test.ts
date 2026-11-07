import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTaxEstimatePence } from './finance-tax-estimate';

test('tax estimate uses only the rate and base supplied by the administrator', () => {
  assert.deepEqual(calculateTaxEstimatePence({ taxableBasePence: 12345, rateBasisPoints: 2000 }), {
    taxableBasePence: 12345, rateBasisPoints: 2000, estimatedTaxPence: 2469,
  });
  assert.equal(calculateTaxEstimatePence({ taxableBasePence: 10000, rateBasisPoints: 0 }).estimatedTaxPence, 0);
});

test('tax estimate rounds to the nearest penny', () => {
  assert.equal(calculateTaxEstimatePence({ taxableBasePence: 1, rateBasisPoints: 5000 }).estimatedTaxPence, 1);
  assert.equal(calculateTaxEstimatePence({ taxableBasePence: 1, rateBasisPoints: 1000 }).estimatedTaxPence, 0);
});

test('tax estimate rejects invalid base and rates rather than guessing', () => {
  assert.throws(() => calculateTaxEstimatePence({ taxableBasePence: -1, rateBasisPoints: 2000 }), /non-negative safe integer/);
  assert.throws(() => calculateTaxEstimatePence({ taxableBasePence: Number.MAX_SAFE_INTEGER + 1, rateBasisPoints: 1000 }), /non-negative safe integer/);
  assert.throws(() => calculateTaxEstimatePence({ taxableBasePence: 10000, rateBasisPoints: 10001 }), /between 0% and 100%/);
  assert.throws(() => calculateTaxEstimatePence({ taxableBasePence: 10000, rateBasisPoints: 2.5 }), /whole basis-point/);
});
