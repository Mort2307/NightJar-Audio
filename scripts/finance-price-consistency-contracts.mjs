import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const finance = readFileSync('src/components/AdminFinanceSimulator.tsx', 'utf8');
const backend = readFileSync('functions/src/index.ts', 'utf8');

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

console.log('Nightjar planning price consistency PASS: finance default/reset £6.99 and backend fallback 699 pence.');
