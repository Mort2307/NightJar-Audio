// Closed-beta Didit pause and trusted-tester access contracts.
// Read-only source checks: no Firebase writes, provider requests or deployment.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const backend = read('functions/src/index.ts');
const app = read('src/App.tsx');
const didit = read('functions/src/didit.ts');
const nightjars = read('functions/src/nightjars.ts');

assert.match(backend, /const CLOSED_BETA = true/, 'the temporary access path must remain private-beta only');
assert.match(backend, /const TESTING_AGE_ASSURANCE_BYPASS = true/, 'the explicit closed-beta tester path must be enabled');
assert.match(backend, /const DIDIT_VERIFICATION_PAUSED = true/, 'new Didit sessions must remain paused');
assert.match(backend, /const DIDIT_ACCOUNT_SELF_SERVICE_ENABLED = false/, 'member self-service Didit must remain disabled');
assert.match(backend, /if \(!TESTING_AGE_ASSURANCE_BYPASS \|\| !CLOSED_BETA\)/, 'temporary access must automatically fail closed outside private beta');
assert.match(backend, /const testerAccessForEmail = async/, 'tester access must come from the server-side allowlist');
assert.match(backend, /data\.enabled !== true \|\| cleanEmail\(data\.email\) !== email/, 'disabled or mismatched allowlist entries cannot pass');

const bypass = backend.slice(backend.indexOf('const temporaryAgeBypassFor = async'), backend.indexOf('const requireAgeVerified = async'));
assert.match(bypass, /ADMIN_EMAILS\.has\(email\)/, 'administrators retain access');
assert.match(bypass, /data\.testAccess === true \|\| await testerAccessForEmail\(email\)/, 'only explicitly admitted tester accounts receive the temporary path');

const ageGate = backend.slice(backend.indexOf('const requireAgeVerified = async'), backend.indexOf('export const getReleasePlaybackUrl'));
assert.match(ageGate, /const persistentVerified = diditPass\(data\)/, 'existing genuine provider approval remains authoritative');
assert.match(ageGate, /if \(persistentVerified\) return data/, 'existing approvals remain unchanged');
assert.match(ageGate, /provider: 'temporary-test-access'/, 'beta access is clearly distinct from provider verification');
assert.doesNotMatch(ageGate, /ageAssurance.*\.set\(/, 'temporary beta access must never write a fake provider approval');

const status = backend.slice(backend.indexOf('export const ageStatus'), backend.indexOf('const controlledDiditRef'));
assert.match(status, /providerVerified: persistentlyVerified/, 'providerVerified must report only genuine Didit evidence');
assert.match(status, /temporaryBypass: bypass\.allowed/, 'temporary beta admission must be reported separately');

const betaListening = backend.slice(backend.indexOf('const betaListeningEntitlementFor'), backend.indexOf('const playbackAccessFor'));
assert.match(betaListening, /TESTING_AGE_ASSURANCE_BYPASS && CLOSED_BETA && explicitTester/, 'allowlisted beta members can use free listening during closed beta');
assert.match(betaListening, /cleanEmail\(data\.email\) === email/, 'beta access remains bound to the same account email');
assert.match(betaListening, /data\.status === 'suspended'/, 'suspended accounts remain blocked');

for (const name of ['startMyDiditControlledCheck','startSingleMemberDiditMaintenanceCheck','startAgeAssurance','adminAuthoriseDiditControlledCheck']) {
  const start = backend.indexOf('export const ' + name);
  assert.ok(start >= 0, 'missing Didit pause endpoint: ' + name);
  const body = backend.slice(start, backend.indexOf('export const ', start + 20));
  assert.match(body, /if \(DIDIT_VERIFICATION_PAUSED\) throw/, name + ' must reject during the pause');
}

assert.match(app, /const DIDIT_VERIFICATION_PAUSED = true/, 'the client must present the paused state');
assert.match(app, /const betaAccess = data\.temporaryBypass === true/, 'the client must recognise separate temporary beta admission');
assert.match(app, /const mayEnter = betaAccess \|\| \(verified && noticeAccepted\)/, 'allowlisted beta access must not wait for Didit');
assert.match(app, /if \(DIDIT_VERIFICATION_PAUSED\) \{/, 'client-side controls must not offer an admin exception');
assert.match(app, /No Didit approval is created by invitation/, 'member-facing copy must not imply invite equals Didit verification');
assert.match(backend, /export \{ diditWebhook, processDiditWebhook \} from '\.\/didit'/, 'existing Didit webhook processing must remain connected');
assert.match(didit, /export const diditWebhook/, 'the provider webhook implementation remains present');
assert.match(nightjars, /const TESTING_AGE_ASSURANCE_BYPASS = true/, 'gift module uses the same temporary beta access mode');
assert.match(nightjars, /CLOSED_BETA_ALLOWLIST_COLLECTION = 'closedBetaAllowlist'/, 'gift module uses the server-side invite list');

console.log('NightJar closed-beta Didit pause and trusted-tester access contracts PASS (source-level).');
