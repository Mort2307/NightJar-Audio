import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const legal = read('src/legal/nightjarLegal.ts');
const gate = read('src/components/MemberSecurityGate.tsx');
const backend = read('functions/src/index.ts');

const expected = '2026-10-15.2';
assert.match(legal, new RegExp("NIGHTJAR_PLATFORM_TERMS_VERSION = '" + expected.replace(/\./g, '\\.') + "'"), 'Updated terms version required');
assert.match(backend, /platform_terms:\s*\{\s*id: 'platform_terms',\s*version: '2026-10-15\.2'/, 'Cloud Functions must enforce same updated terms version');
assert.match(legal, /NIGHTJAR_LEGAL_VERSION = '2026-10-15\.1'/, 'Unchanged Privacy Notice version must not be needlessly re-accepted');
assert.match(legal, /version:NIGHTJAR_PLATFORM_TERMS_VERSION/, 'Published terms must use new version');
assert.match(legal, /\{ id:'platform_terms', version:NIGHTJAR_PLATFORM_TERMS_VERSION, accepted:true \}/, 'Registration must submit new platform terms version');
assert.match(legal, /\{ id:'privacy_notice', version:NIGHTJAR_LEGAL_VERSION, accepted:true \}/, 'Registration privacy acknowledgement must retain its own version');

for (const heading of Array.from({ length: 10 }, (_, i) => '8.' + (i + 1))) {
  assert.ok(legal.includes("heading:'" + heading + ' '), 'Protection clause missing: ' + heading);
}
for (const phrase of [
  'creators retain the intellectual-property rights',
  'privacy and personal data of listeners',
  'competing service',
  'lawfully required or permitted',
  'not conclusive proof',
  'a human review',
  'do not impose automatic contractual fines',
  'independent right to act',
  'Good-faith reports',
  'Nothing in this section prevents uses permitted by copyright law',
]) {
  assert.ok(legal.includes(phrase), 'Fair, rights-based legal protection missing: ' + phrase);
}

assert.match(gate, /Un(?:authorised|authorized) copying or disclosure of protected work/, 'Mandatory gate must surface copyright protections');
assert.match(gate, /I have reviewed and agree to these Terms of Use/, 'Explicit consent to Terms checkbox must remain required');
assert.match(gate, /I acknowledge I have been shown this privacy notice/, 'Privacy notice must remain acknowledgement, not coerced consent');
assert.match(backend, /account\.acceptedPlatformTermsVersion !== CURRENT_LEGAL_DOCUMENTS\.platform_terms\.version/, 'Protected backend must reject outdated Terms');
assert.match(backend, /accountRef\(identity\.uid\)\.collection\('legalAcceptanceHistory'\)\.doc\(\)/, 'New acceptance history must be retained separately from the latest mirror');
assert.equal((backend.match(/\.collection\('legalAcceptanceHistory'\)\.doc\(\)/g) || []).length, 2, 'Both registration and existing-user acceptance paths must preserve audit history');
assert.match(backend, /if \(entry\.accepted !== true\)/, 'Explicit positive agreement action must be validated server-side');
assert.match(backend, /source:'registration'/, 'Staged registration acceptance must remain attributed');

console.log('PASS fair creative-work protections, updated terms gating, privacy separation and legal acceptance history.');
