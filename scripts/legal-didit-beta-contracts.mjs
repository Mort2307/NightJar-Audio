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
assert.ok(backend.includes('const TESTING_AGE_ASSURANCE_BYPASS = false;'),
  'Temporary private-beta access must not bypass mandatory live Didit verification');
assert.ok(backend.includes('const CLOSED_BETA = true;'),
  'Private beta must remain closed to unapproved public signups');
assert.ok(backend.includes('DIDIT_LIVE_PILOT_ADMINS_ONLY = false'),
  'Mandatory Didit must admit all approved beta members, not just administrators');
assert.match(backend, /DIDIT_LIVE_PILOT_ADMINS_ONLY && !identity\.admin/,
  'Legacy admin pilot restriction is conditional and cannot block normal account verification');
assert.ok(app.includes('Start my live Didit test') && app.includes('ageProviderVerified'),
  'Admin must have a clearly labelled real-provider pilot and distinct verification indicator');
assert.ok(age.includes('providerVerified?: boolean') && age.includes('livePilotAvailable?: boolean'),
  'Didit status distinguishes permanent provider evidence from temporary beta access');
assert.ok(!app.includes('Yoti'), 'Old Yoti UI must not be shown once Didit integration is deployed');
assert.ok(!backend.includes('AGE_ASSURANCE_CONFIGURED'), 'Legacy age flag must not overwrite Didit setup');
assert.ok(hosting.hosting.rewrites.some(x=>x.source==='/api/webhooks/didit'&&x.function?.functionId==='diditWebhook'),
  'Didit webhook route must precede hosting fallback');
// Regression: registration must mirror the *explicitly accepted*, current
// Terms + Privacy versions in the same Firestore batch. This prevents the
// first Didit check, its status read and non-billable recovery all failing 400
// after a valid sign-up. Stale mirrors may be reconciled only after inspecting
// both account-owned, current, non-withdrawn legal acceptance records.
const currentAcceptance = backend.slice(backend.indexOf('const currentLegalAcceptanceFor = async'),backend.indexOf('const requireCurrentLegalAcceptance = async'));
assert.match(currentAcceptance, /data\.version === expected\.version && data\.withdrawnAt == null/, 'withdrawn or outdated consent cannot satisfy the mirror repair');
const accessGate = backend.slice(backend.indexOf('const requireActiveIdentity = async'),backend.indexOf('export const health = onRequest'));
assert.match(accessGate, /account\.acceptedPlatformTermsVersion !== CURRENT_LEGAL_DOCUMENTS\.platform_terms\.version/, 'stale mirror detection required');
assert.match(accessGate, /currentLegalAcceptanceFor\(identity\.uid, 'platform_terms'\)/, 'restore only from actual accepted Terms');
assert.match(accessGate, /currentLegalAcceptanceFor\(identity\.uid, 'privacy_notice'\)/, 'restore only from actual acknowledged Privacy Notice');
assert.match(accessGate, /if \(!terms\.accepted \|\| !privacy\.accepted\)/, 'missing agreement must still fail closed');
assert.match(accessGate, /await accountRef\(identity\.uid\)\.set\(/, 'save verified current legal mirror for existing users');
assert.match(accessGate, /acceptedPlatformTermsVersion: CURRENT_LEGAL_DOCUMENTS\.platform_terms\.version/, 'only current Terms version may be restored');
assert.match(accessGate, /acknowledgedPrivacyNoticeVersion: CURRENT_LEGAL_DOCUMENTS\.privacy_notice\.version/, 'only current Privacy Notice may be restored');
const restoreRegistration = backend.slice(backend.indexOf('if (registrationIntent.exists) {'), backend.indexOf('export const chooseAccountRole = onCall'));
assert.match(restoreRegistration, /acceptedRegistrationDocs\.add\(id\)/, 'new registrations derive mirror only from staged signed-in account evidence');
assert.match(restoreRegistration, /if \(acceptedRegistrationDocs\.has\('platform_terms'\)\)/, 'staged Terms acceptance must control mirror');
assert.match(restoreRegistration, /if \(acceptedRegistrationDocs\.has\('privacy_notice'\)\)/, 'staged Privacy acknowledgement must control mirror');
assert.match(restoreRegistration, /legalBatch\.set\(ref, \{/, 'staged legal documents and account mirror commit together');
assert.match(restoreRegistration, /await legalBatch\.commit\(\);\s*await registrationIntent\.ref\.delete\(\)/, 'intent is deleted only after legal + mirror commit');
const releaseWorkflow=read('.github/workflows/firebase-hosting-merge.yml');
assert.match(releaseWorkflow, /\[nightjar-legal-didit-repair\]/, 'backend-first legal recovery deployment gate missing');
assert.match(releaseWorkflow, /accountIdentity,ageStatus,myDiditControlledCheck,startMyDiditControlledCheck,reconcileMyDiditVerification,startAgeAssurance/, 'must ship the complete sign-in and Didit entry/recovery set');
assert.match(releaseWorkflow, /gh run watch "\$RUN_ID"/, 'Hosting must wait for actual backend result');

console.log('Nightjar T&Cs reading centre, versioned beta terms and Didit bypass contracts PASS');
