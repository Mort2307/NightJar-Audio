import assert from 'node:assert/strict';
import fs from 'node:fs';
const backend = fs.readFileSync('functions/src/index.ts', 'utf8');
const helper = fs.readFileSync('functions/src/entitlements.ts', 'utf8');
const tests = fs.readFileSync('functions/src/entitlements.test.ts', 'utf8');
const start = backend.indexOf('const activeListeningSubscriptionFor = async (userId: string) => {');
const end = backend.indexOf('const playbackAccessFor = (', start);
assert.ok(start >= 0 && end > start, 'protected subscription lookup exists');
const lookup = backend.slice(start, end);
assert.match(backend, /import \{ hasPaidEntitlement \} from '\.\/entitlements'/, 'the entitlement helper is imported into live backend');
assert.match(lookup, /hasPaidEntitlement\(doc\.data\(\), userId\)/, 'catalogue access checks provider-confirmed subscriptions');
assert.doesNotMatch(lookup, /\['active','trialing'\]\.includes/, 'a trial or planning row must not unlock paid content from status alone');
for (const field of ['userId === uid', "subscription.status === 'active'", 'subscription.providerVerified === true', 'subscription.confirmedMonthlyAmountPence > 0', 'subscription.providerSubscriptionId.length > 0', 'periodEndMillis(subscription.currentPeriodEnd) > now']) {
  assert.ok(helper.includes(field), 'missing verified entitlement condition: '+field);
}
assert.match(tests, /providerVerified: false/, 'unit tests reject unverified subscriptions');
assert.match(tests, /currentPeriodEnd: '2028/, 'unit tests reject expired paid periods');
assert.match(backend, /if \(releaseWorkAccess\(data, userId\)\) return \{ allowed:true, reason:'credited_work'/, 'creators retain access to their credited work');
console.log('Nightjar protected paid playback entitlement source contracts passed.');
