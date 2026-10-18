// Mandatory 18+ verification entry contract. Read-only source checks: no Didit
// requests, Firestore writes, provider sessions or production deployment.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const app = read('src/App.tsx');
const panel = read('src/components/DiditControlledLiveCheck.tsx');
const backend = read('functions/src/index.ts');
const nightjars = read('functions/src/nightjars.ts');
const didit = read('functions/src/didit.ts');
const workflow = read('.github/workflows/firebase-hosting-merge.yml');

assert.match(backend, /const TESTING_AGE_ASSURANCE_BYPASS = false/, 'private-beta bypass must not admit unverified adults');
assert.match(nightjars, /const TESTING_AGE_ASSURANCE_BYPASS = false/, 'gift and token endpoints must not bypass Didit');
const backendWorkflow = read('.github/workflows/firebase-backend-deploy.yml');
assert.ok(backendWorkflow.includes('DEPLOY_SCOPE="$(node scripts/firebase-current-functions-scope.mjs)"'), 'all-functions release must use explicit non-deleting targets');
assert.match(backend, /const DIDIT_VERIFICATION_PAUSED = false/, 'public Didit session starter is enabled');
assert.match(backend, /const DIDIT_ACCOUNT_SELF_SERVICE_ENABLED = true/, 'approved safe self-service check remains available to members');
assert.match(backend, /const persistentVerified = diditPass\(data\)/, 'adult backend checks durable provider evidence');
assert.match(backend, /if \(persistentVerified\) return data/, 'provider-approved accounts retain access without repeating ID');
assert.match(didit, /data\?\.environment === 'live'/, 'only live provider results can grant adult access');
assert.match(didit, /data\?\.reverifyRequired !== true/, 'revoked approvals must no longer grant access');

assert.match(app, /const verified = data.providerVerified === true && data.reverifyRequired !== true && data.environment === 'live'/,
  'only authentic unrevoked Didit result advances the UI');
assert.match(app, /const mayEnter = verified && noticeAccepted/, 'no tester bypass, empty role or unaccepted notice may enter');
assert.match(app, /setAgeStage\(mayEnter \? 'app' : 'assurance'\)/, 'non-approved status remains on mandatory gate');
assert.match(app, /if \(ageStage === 'assurance'\) \{/, 'role picker must not hide mandatory gate');
assert.match(app, /aria-modal="true" aria-labelledby="nightjar-verification-title"/, 'mandatory verification is an accessible dialog');
assert.match(app, /<DiditControlledLiveCheck onVerified=/, 'account-linked check is presented at the required gate');
assert.match(app, /DIDIT_VERIFICATION_PAUSED = false/, 'frontend presents the standard verification flow to all unverified members');

assert.match(panel, /if\(result.authorised \|\| result.providerVerified\)/, 'previously approved member notice status is checked');
assert.match(panel, /const acceptApprovedNotice=async\(\)=>/, 'approved member can acknowledge a new notice');
assert.match(panel, /'didit-approved-account-notice-update'/, 'existing approval notice is durable');
const acknowledgement=panel.slice(panel.indexOf('const acceptApprovedNotice=async'),panel.indexOf('const begin=async'));
assert.doesNotMatch(acknowledgement, /nightjarDiditControlled\.start\(|nightjarAge\.start\(/,
  'notice acknowledgement cannot launch a second paid check');
assert.match(panel, /Check my completed Didit result · no new ID check/, 'existing result can be reconciled without a second session');
const automaticReturnBlock=panel.slice(panel.indexOf('// Returning from Didit should automatically'),panel.indexOf('const acceptRequiredAgreements=async'));
assert.match(automaticReturnBlock,/addEventListener\('focus', refreshOnReturn\)/,'returning to the Nightjar tab should refresh the existing status');
assert.match(automaticReturnBlock,/addEventListener\('visibilitychange', refreshOnReturn\)/,'mobile app resume should refresh existing status');
assert.match(automaticReturnBlock,/document\.visibilityState !== 'visible'/,'background activity cannot trigger status calls');
assert.match(automaticReturnBlock,/lastReturnRefreshRef\.current < 15000/,'dual tab focus events are rate-limited');
assert.match(automaticReturnBlock,/void refresh\(\)/,'return only reads the current account status');
assert.doesNotMatch(automaticReturnBlock, /nightjarDiditControlled\.(start|reconcile)\(|nightjarAge\.start\(/,
  'automatic return must neither create a paid ID session nor recover a provider decision without user action');

assert.match(backend, /tx\.create\(grantRef, \{/, 'one-use account claim is durable and race-safe');
assert.match(workflow, /\[nightjar-didit-mandatory-gate-release\]/, 'production backend-first release must be explicitly tagged');
const deploy=workflow.slice(workflow.indexOf('name: Enforce mandatory approved Didit access before Hosting'),
  workflow.indexOf('# Staged account-wide release.'));
assert.match(deploy, /inputs\[scope\]=functions'/, 'policy change must redeploy ALL functions using age bypass');
assert.match(deploy, /gh run watch/, 'Hosting waits for verified backend deployment');
assert.doesNotMatch(deploy, /startDiditSession\(|startAgeAssurance\(/, 'deploy cannot create provider verifications');

console.log('NightJar mandatory once-only Didit age-gate contracts PASS.');
