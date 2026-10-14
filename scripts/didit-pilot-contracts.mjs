import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('functions/src/index.ts', 'utf8');
const didit = fs.readFileSync('functions/src/didit.ts', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const ageClient = fs.readFileSync('src/platform/firebase-age.ts', 'utf8');
const adminClient = fs.readFileSync('src/platform/firebase-administration.ts', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');

const cohort = index.split('export const adminSetDiditPilotAccess = onCall')[1]?.split('export const adminSetAccountRole')[0] ?? '';
assert.ok(cohort, 'dedicated admin-only pilot enrollment callable is exported');
assert.match(cohort, /requireAdminIdentity\(request\)/, 'only backend administrators may enroll members');
assert.match(cohort, /data\.emailVerified !== true/, 'enrolled members must have a verified Firebase email');
assert.match(cohort, /data\.testAccess === true \|\| await testerAccessForEmail\(email\)/, 'cohort membership is limited to allowlisted beta testers');
assert.match(cohort, /await db\.collection\('accounts'\)\.where\('email', '==', email\)/, 'cohort access targets the real existing account');
assert.match(cohort, /diditPilotEnabled: enabled/, 'only the pilot permission is modified');
assert.doesNotMatch(cohort, /startDiditSession|verified: true|testAccess: false|accountStatus: 'active'|status: 'active'/, 'enrolment never starts ID verification, bypass removal or account activation');

const status = index.split('export const ageStatus = onCall')[1]?.split('export const startAgeAssurance')[0] ?? '';
assert.match(status, /diditPass\(data\)/, 'real provider-approved 18+ grant has precedence over any bypass');
assert.match(status, /persistentlyVerified \|\| bypass\.allowed/, 'existing tester bypass stays valid until formally retired');
assert.match(status, /diditPilotEligible: pilotAccess/, 'client receives a server-authorised opt-in eligibility flag');
assert.match(status, /providerVerified: persistentlyVerified/, 'bypass cannot masquerade as a real Didit verification');

const starter = index.split('export const startAgeAssurance = onCall')[1]?.split('export const adminAgeTestPass')[0] ?? '';
assert.match(starter, /if \(diditPass\(record\)\) return \{ verified: true/, 'repeat logins never trigger a second KYC when a valid pass exists');
assert.match(starter, /DIDIT_LIVE_PILOT_ADMINS_ONLY && !identity\.admin && !individuallyApprovedPilot/, 'no global automatic live sessions for testers');
assert.match(starter, /if \(bypass\.allowed\) return \{/, 'ordinary testers retain their bypass');
assert.match(starter, /return startDiditSession\(identity\.uid\)/, 'the backend binds verification sessions to the authenticated account');

assert.match(didit, /data\?\.environment === 'live'/, 'sandbox approvals cannot become permanent identity verification');
assert.match(didit, /data\?\.reverifyRequired !== true/, 'a revoked or expired entitlement is never blindly reused');
assert.match(didit, /if \(diditPass\(existing\)\) return \{ verified: true/, 'no duplicate live session when verified');
assert.match(didit, /old\.uid === uid && old\.environment === env\(\) && old\.workflowId === DIDIT_WORKFLOW_ID\.value\(\)/, 'only a pending session for this account, mode and workflow can be reused');
assert.match(didit, /old\.createdAtMs > Date\.now\(\) - 6 \* 86400_000/, 'pending sessions are reusable across reloads, but not indefinitely');
assert.match(didit, /if \(data\.status === 'CREATING' &&/, 'concurrent browser windows cannot start parallel billable checks');
assert.match(didit, /session\.environment !== payload\.environment/, 'webhook cannot mix sandbox and live decisions');
assert.match(didit, /uid !== payload\.vendorData/, 'signed provider decision is bound to the verified account UID');
assert.match(didit, /payload\.adultEvidence === true/, 'signed approval requires real adult ID evidence');
assert.doesNotMatch(didit, /\b(?:documentImage|rawIdImage|base64Id)\s*:/, 'raw ID images are not persisted');

assert.match(adminClient, /setDiditPilotAccess\(email: string, enabled: boolean\)/, 'Owner UI can enroll or revoke one eligible tester');
assert.match(ageClient, /diditPilotEligible\?: boolean/, 'age status contract explicitly exposes opt-in');
assert.match(app, /<section className="nj-didit-pilot-manager">|<div className="nj-didit-pilot-manager">/, 'Owner sees controlled enrolment controls');
assert.match(app, /<section className="nj-didit-member-pilot"/, 'selected members can see an independent voluntary verification card');
assert.match(app, /!agePilotConsent/, 'member ID checks require explicit acknowledgement');
assert.match(app, /openAgeCheck\(false, true\)/, 'member intentionally launches Didit, never on registration or login');
assert.match(app, /else if \(!memberPilot\)/, 'pilot initiation is not mistakenly blocked by an existing temporary bypass');
assert.match(app, /if \(ageProviderVerified\)/, 'verified members do not get a repeat session button');
assert.match(css, /\.nj-didit-member-pilot/, 'pilot UI has premium responsive layout');


const legalNotice = fs.readFileSync('src/legal/nightjarLegal.ts', 'utf8');
const legalPage = fs.readFileSync('src/components/LegalDocumentPage.tsx', 'utf8');
assert.match(legalNotice, /NIGHTJAR_AGE_NOTICE_VERSION = '2026-10-14\.3'/, 'age notice keeps consistent server version');
assert.match(legalNotice, /age_assurance_notice: \{/, 'Didit privacy notice is published as a readable legal document');
assert.match(index, /age_assurance_notice: \{[\s\S]*?version: '2026-10-14\.3'/, 'backend agreement endpoint can record versioned age-notice acknowledgement');
assert.match(app, /nightjarLegal\.accept\(\[\{/, 'age gate saves affirmative acknowledgement server-side before starting Didit');
assert.match(app, /ageDiditPermission/, 'live identity-check permission is separately requested');
assert.match(app, /!ageNoticeAccepted && !ageNoticeAcknowledged/, 'missing age notice acknowledgement disables start action');
assert.match(app, /!ageProviderVerified && !ageDiditPermission/, 'missing ID-check permission disables start action');
assert.match(app, /Read Nightjar's Age Verification/, 'user can read the actual notice from the gate');
assert.match(legalPage, /age_assurance_notice/, 'legal document shows correct age notice effective date');


const pauseStarter = index.split('export const startAgeAssurance = onCall')[1]?.split('export const adminAgeTestPass')[0] ?? '';
assert.match(index, /const DIDIT_VERIFICATION_PAUSED = true/, 'live start kill switch is enabled');
assert.match(pauseStarter, /if \(DIDIT_VERIFICATION_PAUSED\) throw new HttpsError\('failed-precondition'/, 'backend rejects new sessions from cached clients');
assert.ok(pauseStarter.indexOf('if (DIDIT_VERIFICATION_PAUSED)') < pauseStarter.indexOf('return startDiditSession'), 'pause check precedes provider creation');
assert.match(status, /verificationPaused: DIDIT_VERIFICATION_PAUSED/, 'client can read pause status');
assert.match(app, /const DIDIT_VERIFICATION_PAUSED = true/, 'app visibly pauses verification');
assert.match(app, /Age verification temporarily unavailable/, 'age gate explains outage');
assert.match(app, /!DIDIT_VERIFICATION_PAUSED && agePilotEligible/, 'member pilot suppressed');
assert.match(app, /!DIDIT_VERIFICATION_PAUSED && <section className="panel nj-didit-pilot"/, 'admin pilot suppressed');

console.log('Nightjar Didit emergency pause and existing pilot contracts PASS (source level).');
