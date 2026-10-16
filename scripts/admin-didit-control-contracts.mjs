import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('src/App.tsx','utf8');
const tabs=fs.readFileSync('src/components/AdminWorkspaceTabs.tsx','utf8');
const control=fs.readFileSync('src/components/AdminDiditControlCentre.tsx','utf8');
const client=fs.readFileSync('src/platform/firebase-age.ts','utf8');
const functions=fs.readFileSync('functions/src/index.ts','utf8');
const css=fs.readFileSync('src/index.css','utf8');
const diagnostics=functions.split('export const adminDiditDiagnostics = onCall')[1]?.split('export const startAgeAssurance = onCall')[0] ?? '';

assert.match(tabs, /'didit'/, 'Didit must have its own administrator tile');
assert.match(tabs, /id: 'didit', label: 'Didit'/, 'Didit tile must be visible on the owner dashboard');
assert.match(tabs, /id: 'launch', label: 'Launch'/, 'existing Launch tile must remain');
assert.match(app, /adminWorkspace === 'didit'/, 'Didit controls have their own workspace');
assert.match(app, /<AdminDiditControlCentre/, 'owner result is prominent, not hidden behind a test permission checkbox');
assert.match(app, /onOpenDidit=\{\(\) => openAdminWorkspace\('didit'\)\}/, 'Launch readiness links to Didit workspace');
assert.match(app, /const DIDIT_VERIFICATION_PAUSED = false/, 'ordinary clients must receive the standard mandatory verification flow');
assert.match(functions, /const DIDIT_VERIFICATION_PAUSED = false/, 'new account-bound verification sessions are enabled on backend');
assert.ok(diagnostics,'a read-only admin diagnostic API must be exported');
assert.match(diagnostics, /requireAdminIdentity\(request\)/, 'backend diagnostics require server-authorised admin');
assert.match(diagnostics, /doc\(identity.uid\)/, 'backend diagnostics are confined to the caller own account');
assert.match(diagnostics, /where\('sessionId', '==', sessionId\)/, 'only account-linked webhook receipts are inspected');
assert.match(diagnostics, /processedAt/, 'diagnostics report whether the processor finished');
assert.match(diagnostics, /adultEvidence/, 'safely derived adult evidence state is reported');
assert.doesNotMatch(diagnostics,/startDiditSession|fetch\(|DIDIT_API_KEY|tx\.set\(|\.create\(/,
  'diagnostics must never create a paid provider check, query Didit or write account state');
assert.doesNotMatch(diagnostics,/date_of_birth|document_image|face_image|session\.url|payload\.decision/,
  'diagnostics must not expose identity documents, provider URLs or raw decisions');
assert.match(client, /adminDiditDiagnostics/, 'frontend uses the protected diagnostic callable');
assert.match(control, /Nightjar has saved a live, server-accepted Didit adult verification/, 'only accepted 18+ result is shown as verified');
assert.match(control, /providerVerified === true && status.reverifyRequired !== true/, 'temporary tester bypass is not treated as Didit verification');
assert.match(control, /status.environment === 'live'/, 'sandbox cannot display permanently verified');
assert.match(control, /No verified Didit result/, 'unknown results are not described as verified');
assert.match(control, /no paid check/, 'refresh is clearly safe');
assert.doesNotMatch(control, /nightjarAge\.start\(|startAgeAssurance\(/, 'dashboard cannot create a provider session');
assert.match(control, /business\.didit\.me\/sign-in/, 'owner has a provider console link');
assert.match(control, /console\.cloud\.google\.com\/logs\/query/, 'owner has server log access');
assert.match(css, /\.nj-didit-verdict\.verified/, 'verified state is visually prominent');
console.log('Nightjar read-only Didit owner tile, verification evidence and protected maintenance contracts PASS.');
