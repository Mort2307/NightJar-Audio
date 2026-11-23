import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const finance = readFileSync('src/components/AdminFinanceSimulator.tsx', 'utf8');
const backend = readFileSync('functions/src/index.ts', 'utf8');
const compensation = readFileSync('src/components/CompensationControlCentre.tsx', 'utf8');
const account = readFileSync('src/platform/firebase-account.ts', 'utf8');

const settlementStart = backend.indexOf('export const adminRecordRevenueSettlement');
const settlementEnd = backend.indexOf('export const adminReconcileRevenueSettlement', settlementStart);
const payoutStart = backend.indexOf('export const adminPrepareCreatorPayoutPeriod');
const payoutEnd = backend.indexOf('export const adminApproveCreatorPayoutPeriod', payoutStart);
assert.ok(settlementStart >= 0 && settlementEnd > settlementStart, 'Manual settlement endpoint must remain present.');
assert.ok(payoutStart >= 0 && payoutEnd > payoutStart, 'Creator Pool preparation endpoint must remain present.');
const settlementBackend = backend.slice(settlementStart, settlementEnd) + backend.slice(payoutStart, payoutEnd);

assert.match(compensation, /provider: 'manual_bank_transfer'/,
  'The Compensation Control Centre must record manual bank-transfer source entries.');
assert.doesNotMatch(compensation, /stripe/i,
  'The Compensation Control Centre must not imply an unapproved Stripe integration.');
assert.match(account, /provider: 'manual_bank_transfer'/,
  'The client callable contract must match the manual bank-transfer source.');
assert.match(settlementBackend, /input\.provider === 'manual_bank_transfer'/,
  'The server must accept only the provider-neutral manual bank-transfer source for new entries.');
assert.doesNotMatch(settlementBackend, /stripe/i,
  'Finance settlement and payout-preparation copy must remain provider-neutral.');


assert.match(finance, /const NIGHTJAR_DEFAULT_MONTHLY_PRICE = 6\.99;/,
  'Finance planning defaults must match the agreed £6.99 Nightjar subscription.');
assert.match(finance, /useState\(NIGHTJAR_DEFAULT_MONTHLY_PRICE\)/,
  'Finance simulator initial scenario must use the shared price default.');
assert.match(finance, /setSubscriptionPrice\(NIGHTJAR_DEFAULT_MONTHLY_PRICE\)/,
  'Finance simulator reset must use the shared price default.');
assert.match(finance, /Reset 10k \/ £6\.99 scenario/,
  'Finance reset button must accurately name the subscription price.');
assert.match(backend, /planningMonthlyPricePence:[\s\S]{0,270}?: 699,/,
  'Backend planning fallback must match £6.99; live configured pricing remains authoritative.');

console.log('Nightjar finance contracts PASS: £6.99 planning price, provider-neutral manual bank-transfer entries, and no Stripe billing implication.');
