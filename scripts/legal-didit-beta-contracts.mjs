import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');
const app = read('src/App.tsx');
const entry = read('src/main.tsx');
const hub = read('src/components/LegalCentrePage.tsx');
const documentPage = read('src/components/LegalDocumentPage.tsx');
const docs = read('src/legal/nightjarLegal.ts');
const backend = read('functions/src/index.ts');
const age = read('src/platform/firebase-age.ts');
const hosting = JSON.parse(read('firebase.json'));

assert.match(entry, /isLegalCentre\s*\?\s*<LegalCentrePage\s*\/>/, 'T&Cs must render on a dedicated public page');
assert.match(app, /href="\/legal"[^>]*>T&Cs(?: Centre)?<\/a>/, 'T&Cs Centre should be available in app navigation');
assert.match(hub, /NIGHTJAR_LEGAL_DOCUMENTS/, 'Legal centre must use the same documents as accepted legal versions');
for (const section of ['platform_terms','privacy_notice','professional_terms']) {
  assert.ok(hub.includes(section), section + ' must be available to read');
  assert.ok(docs.includes(section), section + ' must exist in versioned legal catalogue');
  assert.ok(backend.includes(section), section + ' must be enforced by the protected backend');
}
assert.match(documentPage, /legalDocumentForPath/, 'Full legal documents must be readable individually');
assert.ok(!hub.includes('docs/legal/'), 'Unapproved commercial drafts must never appear as accepted beta terms');
assert.ok(!backend.includes('TESTING_AGE_ASSURANCE_BYPASS'), 'Tester bypass is retired');
assert.ok(backend.includes('const CLOSED_BETA = true;'), 'Private beta remains invite-only');
assert.ok(!backend.includes('DIDIT_LIVE_PILOT_ADMINS_ONLY'), 'Every invited tester must have access to the live Didit check');
assert.ok(app.includes('Verify my age with Didit') && app.includes('ageProviderVerified'),
  'All accounts have the same mandatory provider check and saved approval');
assert.ok(age.includes('providerVerified?: boolean'), 'Didit approval is shown distinctly from account access');
assert.ok(!app.includes('Yoti'), 'Old Yoti UI must not be shown once Didit integration is deployed');
assert.ok(!backend.includes('AGE_ASSURANCE_CONFIGURED'), 'Legacy age flag must not overwrite Didit setup');
assert.ok(hosting.hosting.rewrites.some(x=>x.source==='/api/webhooks/didit'&&x.function?.functionId==='diditWebhook'),
  'Didit webhook route must precede hosting fallback');
console.log('Nightjar T&Cs reading centre, versioned beta terms and mandatory Didit contracts PASS');
